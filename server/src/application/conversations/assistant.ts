/**
 * Runs queued assistant messages with bounded tools, owner-scoped resource access, transactional
 * writes and streamed progress.
 */

import { createChatActivity } from './messages.js';
import type pg from 'pg';
import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';
import type { Schema } from '../../../../shared/model.js';
import type { EnvConfig } from '../../config.js';
import type { BlobStorage } from '../../providers/blobs/index.js';
import type { Registry } from '../registry/registry.js';
import type { ChatAi, ChatToolResult, ResearchAnswer, ChatFailure } from './types.js';
import { chatThingContext } from './context.js';
import { mergeResourceCards } from '../../../../shared/resource-cards.js';
import { blankUsage } from '../import/types.js';
import { chatFunctions } from '../../contracts/chat-tools.js';
import * as conversationsDb from '../../db/entities/conversations.js';
import type { ChatJob } from '../../db/entities/conversations.js';
import * as thingsDb from '../../db/entities/things.js';
import { detail } from '../things.js';
import { ApplicationError, ensure } from '../errors.js';
import { awaitWithSignal } from '../../lib/abort.js';
import { publicFields } from '../public-fields.js';
import { publicUrl } from '../../providers/web/resources.js';
import type { ApplicationEvents } from '../events.js';

const ajv = new Ajv({ strict: false });

addFormats.default(ajv);

const validators = new Map(chatFunctions.map((f) => [f.name, ajv.compile(f.parameters)]));

interface LiveMessage {
  messageId: string;
  text: string;
}
interface ToolCard {
  type: Schema['ResourceCard']['type'];
  id: string;
  fieldSetId: string | null;
  fieldId: string | null;
  undefinedFieldId: string | null;
  page: number | null;
}
interface ShowCardsInput {
  cards: ToolCard[];
}

export class Assistant {
  private live = new Map<string, LiveMessage>();

  constructor(
    private pool: pg.Pool,
    private registry: Registry,
    private blobs: BlobStorage,
    private ai: ChatAi | undefined,
    private config: EnvConfig,
    private events: ApplicationEvents,
    private reportFailure: (failure: ChatFailure) => void,
  ) {}

  async snapshot(owner: string, id: string) {
    const result = await conversationsDb.getOwnedConversationSnapshot(this.pool, owner, id);
    const live = this.live.get(owner + ':' + id);

    if (live) {
      const message = result.messages.find(
        (m) => m.id === live.messageId && m.status === 'PROCESSING',
      );
      if (message) message.text = live.text;
    }

    return result;
  }

  async recover() {
    await conversationsDb.recoverMessages(this.pool);
  }

  async next(shutdown: AbortSignal) {
    if (!this.ai) return false;
    const job = await conversationsDb.getNextQueuedMessage(this.pool);
    if (!job) return false;
    await this.run(job, shutdown);
    return true;
  }

  private async run(job: ChatJob, shutdown: AbortSignal) {
    const key = job.ownerId + ':' + job.conversationId;
    const live = { messageId: job.id, text: '' };
    this.live.set(key, live);
    const signal = AbortSignal.any([shutdown, AbortSignal.timeout(this.config.chatTimeoutMs)]);
    const usage = job.usage ?? blankUsage(this.config.openaiModel);
    const started = Date.now();
    const elapsed = usage.elapsedMs;
    let cards: Schema['ResourceCard'][] = [];
    const refs: Schema['SourceRef'][] = [];
    // Retrieval grants this turn access to cards and tools; model-supplied IDs alone do not authorise resources.
    const allowedThings = new Map<string, Schema['Thing']>();
    const allowedResources = new Set<string>();
    const retrievedThings = new Map<string, ReturnType<typeof chatThingContext>>();
    const retrievedFiles = new Map<string, { attachmentId: string; filename: string }>();
    let calls = 0,
      researched = false,
      files = 0;

    const record = async (delta: Partial<Schema['ImportUsage']>) => {
      if (!usage.model) usage.model = delta.model ?? usage.model;
      if (delta.entries?.length) (usage.entries ??= []).push(...delta.entries);
      usage.inputTokens += delta.inputTokens ?? 0;
      usage.outputTokens += delta.outputTokens ?? 0;
      usage.cachedTokens += delta.cachedTokens ?? 0;
      usage.toolCalls.push(...(delta.toolCalls ?? []));
      usage.elapsedMs = elapsed + Date.now() - started;
      await conversationsDb.saveMessage(this.pool, job, { usage });
    };

    const addCard = (card: Schema['ResourceCard']) => {
      const merged = mergeResourceCards([...cards, card]);
      ensure(merged.length <= 24, 'Assistant card limit');
      cards = merged;
    };

    const readThing = async (id: string) => {
      const cached = retrievedThings.get(id);
      if (cached) return cached;
      const thing = await detail(this.pool, job.ownerId, id, this.registry);
      allowedThings.set(id, thing);
      allowedResources.add('thing:' + id);
      const { attachments, activity, truncated } = await conversationsDb.getOwnedChatResources(
        this.pool,
        job.ownerId,
        id,
      );
      for (const a of attachments) allowedResources.add('attachment:' + a.id);

      for (const [kind, table] of [
        ['event', 'events'],
        ['issue', 'issues'],
        ['purchasable', 'purchasables'],
      ] as const)
        activity[table].forEach((i) => allowedResources.add(kind + ':' + i.id));

      const context = chatThingContext(thing, { attachments, activity, truncated });
      retrievedThings.set(id, context);
      return context;
    };

    const execute = async (name: string, args: unknown): Promise<ChatToolResult> => {
      signal.throwIfAborted();
      ensure(++calls <= this.config.chatToolCalls, 'tool_limit', 'UNAVAILABLE');
      ensure(validators.get(name)?.(args), 'Invalid assistant tool arguments');
      const a = args as Record<string, string>;
      let output: unknown;

      if (name === 'search_things') {
        const items = await conversationsDb.searchChatThings(this.pool, job.ownerId, a['query']);
        items.slice(0, 20).forEach((i) => allowedResources.add('thing:' + i.id));
        output = { items: items.slice(0, 20), truncated: items.length > 20 };
      } else if (name === 'read_thing')
        output = retrievedThings.has(a['thingId'])
          ? { thingId: a['thingId'], alreadyRead: true }
          : await readThing(a['thingId']);
      else if (name === 'read_attachment') {
        ensure(allowedResources.has('attachment:' + a['attachmentId']), 'Read its Thing first');
        const includeImages = (args as { includeImages: boolean | null }).includeImages === true;
        const fileKey = JSON.stringify([a['attachmentId'], includeImages]);
        const cached = retrievedFiles.get(fileKey);
        if (cached) {
          await record({ toolCalls: [{ name, resultCount: 1, truncated: false }] });
          return { output: { ...cached, alreadyRead: true } };
        }
        ensure(files < 3, 'Attachment tool limit');
        const file = await conversationsDb.getOwnedChatAttachmentOrThrow(
          this.pool,
          job.ownerId,
          a['attachmentId'],
        );
        ensure(file && file.byteSize <= this.config.maxUploadBytes, 'Attachment unavailable');
        files++;
        const chunks: Buffer[] = [];
        let bytes = 0;

        for await (const chunk of await this.blobs.read(file.storageKey, signal)) {
          signal.throwIfAborted();
          bytes += chunk.length;
          ensure(bytes <= this.config.maxUploadBytes, 'Attachment too large');
          chunks.push(Buffer.from(chunk));
        }

        addCard({ type: 'ATTACHMENT', attachmentId: file.id });
        refs.push({ attachmentId: file.id });
        const output = { attachmentId: file.id, filename: file.filename };
        retrievedFiles.set(fileKey, output);
        await record({
          toolCalls: [{ name, resultCount: 1, truncated: false }],
        });
        return {
          output,
          source: {
            filename: file.filename,
            mediaType: file.mediaType,
            content: Buffer.concat(chunks),
            includeImages,
          },
        };
      } else if (name === 'research') {
        ensure(!researched && this.ai, 'Research unavailable or budget used');
        const thing = allowedThings.get(a['thingId']);
        ensure(thing, 'Read the Thing first');
        const stored = await thingsDb.getOwnedThingOrThrow(this.pool, job.ownerId, thing.id);
        const fields = publicFields(stored.data, this.registry);
        const question = a['question'].trim();
        ensure(question, 'Research question cannot be blank');
        researched = true;
        const researchKey = JSON.stringify(['research', thing.id, question]);
        let found = job.toolResults.find((r) => r.key === researchKey)?.result as
          ResearchAnswer | undefined;
        const researchSignal = AbortSignal.any([
          signal,
          AbortSignal.timeout(this.config.discoveryTimeoutMs),
        ]);
        if (!found) {
          try {
            found = await awaitWithSignal(
              this.ai.research(question, fields, { signal: researchSignal, record }),
              researchSignal,
            );
          } catch (error) {
            if (error instanceof ApplicationError)
              throw new ApplicationError('UNAVAILABLE', 'Research provider failed');
            throw error;
          }
          signal.throwIfAborted();
          ensure(
            typeof found.text === 'string' &&
              found.text.length <= 100000 &&
              Array.isArray(found.sources) &&
              found.sources.every(publicUrl),
            'Invalid research answer',
            'UNAVAILABLE',
          );
          job.toolResults.push({ key: researchKey, result: found });
          await conversationsDb.saveMessage(this.pool, job, { toolResults: job.toolResults });
        }
        found.sources.forEach((url) => refs.push({ url }));
        output = found;
      } else if (name === 'create_event' || name === 'create_issue') {
        ensure(allowedThings.has(a['thingId']), 'Read the Thing first');
        ensure(a['title'].trim(), 'Title cannot be blank');
        ensure(
          job.toolResults.some((result) => result.card) || cards.length < 24,
          'Assistant card limit',
        );
        const kind = name === 'create_event' ? 'event' : 'issue';
        const saved = await createChatActivity(
          this.pool,
          job,
          name,
          {
            thingId: a['thingId'],
            title: a['title'],
            description: a['description'],
          },
          signal,
        );
        if (!job.toolResults.some((r) => r.key === name)) job.toolResults.push(saved);
        if (saved.card) addCard(saved.card);
        const item = saved.result as { id: string };
        allowedResources.add(kind + ':' + item.id);
        output = saved.result;
        this.events.publish({ type: 'data.changed', ownerId: job.ownerId });
      } else if (name === 'show_cards') {
        const selected = (args as unknown as ShowCardsInput).cards;
        const selectedCards: Schema['ResourceCard'][] = [];
        const selectedRefs: Schema['SourceRef'][] = [];

        for (const c of selected) {
          ensure(
            allowedResources.has(
              (c.type === 'FIELD' ? 'thing' : c.type.toLowerCase()) + ':' + c.id,
            ),
            'Card was not retrieved',
          );

          if (c.type === 'FIELD') {
            const thing = allowedThings.get(c.id);
            ensure(thing, 'Read the Thing first');
            ensure(!!c.fieldId !== !!c.undefinedFieldId, 'Choose one field address');
            ensure(!c.undefinedFieldId || !c.fieldSetId, 'Custom fields have no field set');
            const fields = c.fieldSetId
              ? thing.fieldSets.find((s) => s.id === c.fieldSetId)?.fields
              : thing.standaloneFields;
            const field = c.undefinedFieldId
              ? thing.undefinedFields.find((f) => f.id === c.undefinedFieldId)
              : fields?.find((f) => f.id === c.fieldId);
            ensure(field, 'Unknown field');
            selectedCards.push(
              c.undefinedFieldId
                ? {
                    type: 'FIELD',
                    thingId: c.id,
                    fieldSetId: null,
                    fieldId: null,
                    undefinedFieldId: field.id,
                  }
                : { type: 'FIELD', thingId: c.id, fieldSetId: c.fieldSetId, fieldId: field.id },
            );
            selectedRefs.push(...field.sourceRefs);
          } else if (c.type === 'THING') selectedCards.push({ type: 'THING', thingId: c.id });
          else if (c.type === 'ATTACHMENT') {
            selectedCards.push({
              type: 'ATTACHMENT',
              attachmentId: c.id,
              ...(c.page ? { page: c.page } : {}),
            });
            selectedRefs.push({
              attachmentId: c.id,
              ...(c.page ? { page: c.page } : {}),
            });
          } else if (c.type === 'EVENT') selectedCards.push({ type: 'EVENT', eventId: c.id });
          else if (c.type === 'ISSUE') selectedCards.push({ type: 'ISSUE', issueId: c.id });
          else selectedCards.push({ type: 'PURCHASABLE', purchasableId: c.id });
        }

        const merged = mergeResourceCards([...cards, ...selectedCards]);
        ensure(merged.length <= 24, 'Assistant card limit');
        cards = merged;
        refs.push(...selectedRefs);
        output = { shown: selected.length };
      }

      signal.throwIfAborted();
      await record({ toolCalls: [{ name, resultCount: 1, truncated: false }] });
      return { output };
    };

    const executeTool = async (name: string, args: unknown): Promise<ChatToolResult> => {
      try {
        return await execute(name, args);
      } catch (error) {
        signal.throwIfAborted();
        if (
          error instanceof ApplicationError &&
          ['INVALID_INPUT', 'NOT_FOUND'].includes(error.kind)
        ) {
          await record({ toolCalls: [{ name, resultCount: 0, truncated: false }] });
          return { output: { error: error.message } };
        }
        throw error;
      }
    };

    try {
      await conversationsDb.saveMessage(this.pool, job, { status: 'PROCESSING' });
      this.events.publish({ type: 'data.changed', ownerId: job.ownerId });
      const history = await conversationsDb.getOwnedConversationSnapshot(
        this.pool,
        job.ownerId,
        job.conversationId,
      );
      const messages = history.messages
        .filter((m) => m.id !== job.id && m.status === 'COMPLETE')
        .map((m) => ({ role: m.role, content: m.text }));

      const activeThing = job.thingId ? await readThing(job.thingId) : undefined;

      for (const receipt of job.toolResults) if (receipt.card) addCard(receipt.card);
      const text = await awaitWithSignal(
        this.ai!.respond(
          {
            messages,
            thingId: job.thingId,
            completedWrites: job.toolResults.filter((r) => r.key.startsWith('create_')),
            activeThing,
          },
          { definitions: chatFunctions, execute: executeTool },
          {
            signal,
            record,
            delta: (text) => {
              signal.throwIfAborted();
              ensure(
                typeof text === 'string' && live.text.length + text.length <= 100000,
                'Assistant text limit',
              );
              // Offsets let clients reconcile streamed text with snapshots; this live buffer is lost on process restart.
              const offset = live.text.length;
              live.text += text;
              this.events.publish({
                type: 'conversation.delta',
                ownerId: job.ownerId,
                conversationId: job.conversationId,
                delta: { messageId: job.id, offset, text },
              });
            },
          },
        ),
        signal,
      );
      signal.throwIfAborted();
      ensure(text.trim() && text.length <= 100000, 'Empty assistant answer');
      await conversationsDb.saveMessage(this.pool, job, {
        text,
        cards,
        sourceRefs: [...new Map(refs.map((r) => [JSON.stringify(r), r])).values()],
        status: 'COMPLETE',
        error: null,
      });
    } catch (error) {
      const code = shutdown.aborted
        ? 'interrupted'
        : signal.aborted
          ? 'timeout'
          : 'assistant_failed';
      this.reportFailure({
        conversationId: job.conversationId,
        messageId: job.id,
        kind:
          error instanceof ApplicationError
            ? error.kind
            : error instanceof Error
              ? error.name
              : code,
        message:
          error instanceof ApplicationError
            ? error.message
            : error instanceof Error &&
                /^(chat_provider_failed|tool_limit|ai_http_\d+)$/.test(error.message)
              ? error.message
              : code,
      });
      await conversationsDb.saveMessage(this.pool, job, {
        text: live.text,
        cards,
        sourceRefs: [...new Map(refs.map((r) => [JSON.stringify(r), r])).values()],
        status: 'FAILED',
        error: code,
      });
    } finally {
      try {
        await record({});
      } finally {
        this.live.delete(key);
        this.events.publish({ type: 'data.changed', ownerId: job.ownerId });
      }
    }
  }
}
