/**
 * Runs queued assistant messages with bounded tools, owner-scoped resource access, transactional
 * writes and streamed progress.
 */

import { getEnv } from '../../config.js';
import { createChatActivity } from './messages.js';
import { updateChatFields, type ChatFieldEvidence } from './fields.js';
import { searchFields, searchFieldSets } from '../registry/index.js';
import type pg from 'pg';
import type { Schema } from '../../../../shared/model.js';
import type { BlobStorage } from '../../providers/blobs/index.js';
import type { Registry } from '../registry/registry.js';
import type { ChatAi, ChatToolResult, ChatToolCall, ChatTools, ResearchAnswer } from './types.js';
import { chatThingContext } from './context.js';
import { mergeResourceCards } from '../../../../shared/resource-cards.js';
import { blankUsage, getImportFailureReason } from '../import/types.js';
import * as conversationsDb from '../../db/entities/conversations.js';
import type { ChatJob } from '../../db/entities/conversations.js';
import * as thingsDb from '../../db/entities/things.js';
import { detail } from '../things.js';
import { ApplicationError, ensure } from '../errors.js';
import { awaitWithSignal } from '../../lib/abort.js';
import { publicFields } from '../public-fields.js';
import { publicUrl } from '../../providers/web/resources.js';
import type { ApplicationEvents } from '../events.js';
import * as metrics from '../../metrics.js';

interface LiveMessage {
  messageId: string;
  text: string;
}
export class Assistant {
  private live = new Map<string, LiveMessage>();

  constructor(
    private pool: pg.Pool,
    private registry: Registry,
    private blobs: BlobStorage,
    private ai: ChatAi | undefined,
    private events: ApplicationEvents,
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
    await metrics.withChatTurn(job, () => this.run(job, shutdown));
    return true;
  }

  private async run(job: ChatJob, shutdown: AbortSignal) {
    const key = job.ownerId + ':' + job.conversationId;
    const live = { messageId: job.id, text: '' };
    this.live.set(key, live);
    const signal = AbortSignal.any([shutdown, AbortSignal.timeout(getEnv('CHAT_TIMEOUT_MS'))]);
    const usage = job.usage ?? blankUsage();
    const started = Date.now();
    const elapsed = usage.elapsedMs;
    let cards: Schema['ResourceCard'][] = [];
    let timeToFirstTokenMs: number | undefined;
    const refs: Schema['SourceRef'][] = [];
    // Retrieval grants this turn access to cards and tools; model-supplied IDs alone do not authorise resources.
    const allowedThings = new Map<string, Schema['Thing']>();
    const allowedResources = new Set<string>();
    const retrievedFiles = new Set<string>();
    const fieldEvidence: ChatFieldEvidence = {
      fieldIds: new Set(),
      setIds: new Set(),
      attachmentIds: new Set(),
      urls: new Set(),
    };
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

    const addCards = (...selected: Schema['ResourceCard'][]) => {
      const merged = mergeResourceCards([...cards, ...selected]);
      ensure(merged.length <= 24, 'Assistant card limit');
      cards = merged;
    };

    const readThing = async (id: string) => {
      const thing = await detail(this.pool, job.ownerId, id, this.registry, {
        redactSensitive: true,
      });
      if (id === job.thingId) metrics.setJobEntity({ type: 'thing', id, name: thing.name });
      allowedThings.set(id, thing);
      allowedResources.add('thing:' + id);
      const resources = await conversationsDb.getOwnedChatResources(this.pool, job.ownerId, id);
      for (const a of resources.attachments) allowedResources.add('attachment:' + a.id);

      for (const [kind, table] of [
        ['event', 'events'],
        ['task', 'tasks'],
        ['issue', 'issues'],
        ['purchasable', 'purchasables'],
      ] as const)
        resources[table].forEach((i) => allowedResources.add(kind + ':' + i.id));

      return chatThingContext(thing, resources);
    };

    const execute = async ({ name, args }: ChatToolCall): Promise<ChatToolResult> => {
      signal.throwIfAborted();
      ensure(++calls <= getEnv('CHAT_TOOL_CALLS'), 'tool_limit', 'UNAVAILABLE');
      let output: unknown;

      if (name === 'search_things') {
        const items = await conversationsDb.searchChatThings(this.pool, job.ownerId, args.query);
        items.slice(0, 20).forEach((i) => allowedResources.add('thing:' + i.id));
        output = { items: items.slice(0, 20), truncated: items.length > 20 };
      } else if (name === 'read_thing')
        output = allowedThings.has(args.thingId)
          ? { thingId: args.thingId, alreadyRead: true }
          : await readThing(args.thingId);
      else if (name === 'search_field_sets') {
        ensure(
          [...allowedThings.values()].some((thing) => thing.categoryId === args.categoryId),
          'Read a Thing in this category first',
        );
        const result = await searchFieldSets(this.pool, this.registry, args.categoryId, args.terms);
        for (const set of result.sets) {
          fieldEvidence.setIds.add(set.id);
          set.fields.forEach((field) => fieldEvidence.fieldIds.add(field.id));
        }
        output = result;
      } else if (name === 'search_fields') {
        ensure(allowedThings.size, 'Read the Thing first');
        const result = await searchFields(this.pool, this.registry, args.labels);
        result.results
          .flatMap((entry) => entry.fields)
          .forEach((field) => fieldEvidence.fieldIds.add(field.id));
        output = result;
      } else if (name === 'read_attachment') {
        ensure(allowedResources.has('attachment:' + args.attachmentId), 'Read its Thing first');
        const includeImages = args.includeImages === true;
        const fileKey = JSON.stringify([args.attachmentId, includeImages]);
        if (retrievedFiles.has(fileKey)) {
          await record({ toolCalls: [{ name, resultCount: 1, truncated: false }] });
          return { output: { attachmentId: args.attachmentId, alreadyRead: true } };
        }
        ensure(files < 3, 'Attachment tool limit');
        const file = await conversationsDb.getOwnedChatAttachmentOrThrow(
          this.pool,
          job.ownerId,
          args.attachmentId,
        );
        ensure(file && file.byteSize <= getEnv('MAX_UPLOAD_BYTES'), 'Attachment unavailable');
        files++;
        const chunks: Buffer[] = [];
        let bytes = 0;

        for await (const chunk of await this.blobs.read(file.storageKey, signal)) {
          signal.throwIfAborted();
          bytes += chunk.length;
          ensure(bytes <= getEnv('MAX_UPLOAD_BYTES'), 'Attachment too large');
          chunks.push(Buffer.from(chunk));
        }

        addCards({ type: 'ATTACHMENT', attachmentId: file.id });
        refs.push({ attachmentId: file.id });
        const output = { attachmentId: file.id, filename: file.filename };
        retrievedFiles.add(fileKey);
        fieldEvidence.attachmentIds.add(file.id);
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
        const thing = allowedThings.get(args.thingId);
        ensure(thing, 'Read the Thing first');
        const stored = await thingsDb.getOwnedThingOrThrow(this.pool, job.ownerId, thing.id);
        const fields = publicFields(stored.data, this.registry);
        const question = args.question.trim();
        ensure(question, 'Research question cannot be blank');
        researched = true;
        const researchKey = JSON.stringify(['research', thing.id, question]);
        let found = job.toolResults.find((r) => r.key === researchKey)?.result as
          ResearchAnswer | undefined;
        const researchSignal = AbortSignal.any([
          signal,
          AbortSignal.timeout(getEnv('DISCOVERY_TIMEOUT_MS')),
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
        output = { ...found, sources: found.sources.slice(0, 3) };
        found.sources.slice(0, 3).forEach((url) => fieldEvidence.urls.add(url));
      } else if (name === 'update_thing_fields') {
        ensure(allowedThings.has(args.thingId), 'Read the Thing first');
        const projected: Schema['ResourceCard'][] = args.values.map(({ fieldSetId, fieldId }) => ({
          type: 'FIELD',
          thingId: args.thingId,
          fieldSetId,
          fieldId,
        }));

        // New custom fields receive their IDs during the write, so reserve their card slots.
        let newCustomFields = 0;
        for (const field of args.customFields) {
          if (field.customFieldId)
            projected.push({
              type: 'FIELD',
              thingId: args.thingId,
              fieldSetId: null,
              fieldId: null,
              customFieldId: field.customFieldId,
            });
          else newCustomFields++;
        }
        ensure(
          job.toolResults.some((receipt) => receipt.key === name) ||
            mergeResourceCards([...cards, ...projected]).length + newCustomFields <= 24,
          'Assistant card limit',
        );
        const saved = await updateChatFields(
          this.pool,
          job,
          args,
          this.registry,
          fieldEvidence,
          signal,
        );
        if (!job.toolResults.some((receipt) => receipt.key === name)) job.toolResults.push(saved);
        addCards(...(saved.cards ?? []));
        output = saved.result;
        this.events.publish({ type: 'data.changed', ownerId: job.ownerId });
        await readThing(args.thingId);
      } else if (name === 'create_task' || name === 'create_event' || name === 'create_issue') {
        ensure(allowedThings.has(args.thingId), 'Read the Thing first');
        ensure(
          args.title.trim() && args.title.length <= 200 && args.description.length <= 4000,
          'Invalid activity details',
        );
        ensure(
          job.toolResults.some((result) => result.card) || cards.length < 24,
          'Assistant card limit',
        );
        const kind = name === 'create_task' ? 'task' : name === 'create_event' ? 'event' : 'issue';
        const saved = await createChatActivity(this.pool, job, name, args, signal);
        if (!job.toolResults.some((r) => r.key === name)) job.toolResults.push(saved);
        if (saved.card) addCards(saved.card);
        const item = saved.result as { id: string };
        allowedResources.add(kind + ':' + item.id);
        output = saved.result;
        this.events.publish({ type: 'data.changed', ownerId: job.ownerId });
      } else if (name === 'show_cards') {
        const selected = args.cards;
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
            ensure(!!c.fieldId !== !!c.customFieldId, 'Choose one field address');
            ensure(!c.customFieldId || !c.fieldSetId, 'Custom fields have no field set');
            const fields = c.fieldSetId
              ? thing.fieldSets.find((s) => s.id === c.fieldSetId)?.fields
              : thing.standaloneFields;
            const field = c.customFieldId
              ? thing.customFields.find((f) => f.id === c.customFieldId)
              : fields?.find((f) => f.id === c.fieldId);
            ensure(field, 'Unknown field');
            selectedCards.push({
              type: 'FIELD',
              thingId: c.id,
              fieldSetId: c.customFieldId ? null : c.fieldSetId,
              fieldId: c.customFieldId ? null : field.id,
              ...(c.customFieldId ? { customFieldId: field.id } : {}),
            });
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
          else if (c.type === 'TASK') selectedCards.push({ type: 'TASK', taskId: c.id });
          else if (c.type === 'ISSUE') selectedCards.push({ type: 'ISSUE', issueId: c.id });
          else selectedCards.push({ type: 'PURCHASABLE', purchasableId: c.id });
        }

        addCards(...selectedCards);
        refs.push(...selectedRefs);
        output = { shown: selected.length };
      }

      signal.throwIfAborted();
      await record({ toolCalls: [{ name, resultCount: 1, truncated: false }] });
      return { output };
    };

    const executeTool: ChatTools['execute'] = async (name, args) => {
      try {
        // The generic capability contract ties each name to its argument type.
        return await execute({ name, args } as ChatToolCall);
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
      metrics.setJobStage('load_context');
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

      for (const receipt of job.toolResults) {
        if (receipt.card) addCards(receipt.card);
        addCards(...(receipt.cards ?? []));
      }
      const { activityContext } = await conversationsDb.getOwnedConversationOrThrow(
        this.pool,
        job.ownerId,
        job.conversationId,
      );
      metrics.setJobStage('respond');
      const text = await awaitWithSignal(
        this.ai!.respond(
          {
            messages,
            activityContext,
            thingId: job.thingId,
            completedWrites: job.toolResults.filter(
              (r) => r.key.startsWith('create_') || r.key === 'update_thing_fields',
            ),
            activeThing,
          },
          { execute: executeTool },
          {
            signal,
            record,
            delta: (text) => {
              if (text && timeToFirstTokenMs === undefined)
                timeToFirstTokenMs = Date.now() - started;
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
      metrics.setJobStage('save_outcome');
      usage.elapsedMs = elapsed + Date.now() - started;
      await conversationsDb.saveMessage(this.pool, job, {
        text,
        cards,
        sourceRefs: [...new Map(refs.map((r) => [JSON.stringify(r), r])).values()],
        status: 'COMPLETE',
        error: null,
        usage,
      });
      return {
        status: 'COMPLETE',
        textCharacters: text.length,
        cardCount: cards.length,
        sourceCount: refs.length,
        timeToFirstTokenMs,
      } as const;
    } catch (error) {
      const stage = metrics.getJobStage();
      const code = shutdown.aborted
        ? 'interrupted'
        : signal.aborted
          ? 'timeout'
          : 'assistant_failed';
      const failureReason = getImportFailureReason(error);
      const reason =
        code === 'interrupted'
          ? 'shutdown'
          : code === 'timeout'
            ? 'deadline'
            : failureReason === 'import_failed'
              ? code
              : failureReason;
      metrics.setJobStage('save_outcome');
      usage.elapsedMs = elapsed + Date.now() - started;
      await conversationsDb.saveMessage(this.pool, job, {
        text: live.text,
        cards,
        sourceRefs: [...new Map(refs.map((r) => [JSON.stringify(r), r])).values()],
        status: 'FAILED',
        error: code,
        usage,
      });
      return {
        status: 'FAILED',
        stage,
        reason,
        textCharacters: live.text.length,
        timeToFirstTokenMs,
        unexpectedError:
          reason.startsWith('database_') || reason === 'assistant_failed' ? error : undefined,
      } as const;
    } finally {
      this.live.delete(key);
      this.events.publish({ type: 'data.changed', ownerId: job.ownerId });
    }
  }
}
