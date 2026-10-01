import { createChatActivity } from './messages.js';
/**
 * Runs queued assistant messages with bounded tools, owner-scoped resource access, transactional
 * writes and streamed progress.
 */

import type pg from 'pg';
import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';
import type { Schema } from '../../../../shared/model.js';
import type { EnvConfig } from '../../config.js';
import type { BlobStorage } from '../../providers/blobs/index.js';
import type { Registry } from '../registry/registry.js';
import type { ChatAi, ChatToolResult } from './types.js';
import type { ImportAi, Discovery } from '../import/types.js';
import { blankUsage } from '../import/types.js';
import { chatFunctions } from '../../contracts/chat-tools.js';
import {
  conversation,
  type ChatJob,
  recoverMessages,
  nextMessage,
  saveMessage,
  searchChatThings,
  chatResources,
  chatAttachment,
} from '../../db/entities/conversations.js';
import { ownedThing } from '../../db/entities/things.js';
import { detail } from '../things.js';
import { ensure } from '../errors.js';
import { awaitWithSignal } from '../../lib/abort.js';
import { publicDiscoveryCandidate } from '../import/mapping.js';
import { publicUrl, persistDiscovery } from '../discovery/discovery.js';
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
    private discoveryAi: ImportAi | undefined,
    private config: EnvConfig,
    private events: ApplicationEvents,
  ) {}

  async snapshot(owner: string, id: string) {
    const result = await conversation(this.pool, owner, id);
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
    await recoverMessages(this.pool);
  }

  async next(shutdown: AbortSignal) {
    if (!this.ai) return false;
    const job = await nextMessage(this.pool);
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
    const cards: Schema['ResourceCard'][] = [];
    const refs: Schema['SourceRef'][] = [];
    // Retrieval grants this turn access to cards and tools; model-supplied IDs alone do not authorise resources.
    const allowedThings = new Map<string, Schema['Thing']>();
    const allowedResources = new Set<string>();
    let calls = 0,
      discovered = false,
      files = 0;

    const record = async (delta: Partial<Schema['ImportUsage']>) => {
      usage.model = delta.model ?? usage.model;
      usage.inputTokens += delta.inputTokens ?? 0;
      usage.outputTokens += delta.outputTokens ?? 0;
      usage.cachedTokens += delta.cachedTokens ?? 0;
      usage.toolCalls.push(...(delta.toolCalls ?? []));
      usage.elapsedMs = elapsed + Date.now() - started;
      await saveMessage(this.pool, job, { usage });
    };

    const addCard = (card: Schema['ResourceCard']) => {
      if (!cards.some((c) => JSON.stringify(c) === JSON.stringify(card))) {
        ensure(cards.length < 24, 'Assistant card limit');
        cards.push(card);
      }
    };

    const readThing = async (id: string) => {
      const thing = await detail(this.pool, job.ownerId, id, this.registry);
      allowedThings.set(id, thing);
      allowedResources.add('thing:' + id);
      const { attachments, activity, truncated } = await chatResources(this.pool, job.ownerId, id);
      for (const a of attachments) allowedResources.add('attachment:' + a.id);

      for (const [kind, table] of [
        ['event', 'events'],
        ['issue', 'issues'],
        ['purchasable', 'purchasables'],
      ] as const)
        activity[table].forEach((i) => allowedResources.add(kind + ':' + i.id));

      return { thing, attachments, ...activity, truncated };
    };

    const execute = async (name: string, args: unknown): Promise<ChatToolResult> => {
      signal.throwIfAborted();
      ensure(++calls <= this.config.chatToolCalls, 'tool_limit');
      ensure(validators.get(name)?.(args), 'Invalid assistant tool arguments');
      const a = args as Record<string, string>;
      let output: unknown;

      if (name === 'search_things') {
        const items = await searchChatThings(this.pool, job.ownerId, a['query']);
        items.slice(0, 20).forEach((i) => allowedResources.add('thing:' + i.id));
        output = { items: items.slice(0, 20), truncated: items.length > 20 };
      } else if (name === 'read_thing') output = await readThing(a['thingId']);
      else if (name === 'read_attachment') {
        ensure(++files <= 3, 'Attachment tool limit');
        ensure(allowedResources.has('attachment:' + a['attachmentId']), 'Read its Thing first');
        const file = await chatAttachment(this.pool, job.ownerId, a['attachmentId']);
        ensure(file && file.byteSize <= this.config.maxUploadBytes, 'Attachment unavailable');
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
        await record({
          toolCalls: [{ name, resultCount: 1, truncated: false }],
        });
        return {
          output: { attachmentId: file.id, filename: file.filename },
          source: {
            filename: file.filename,
            mediaType: file.mediaType,
            content: Buffer.concat(chunks),
          },
        };
      } else if (name === 'discover') {
        ensure(!discovered && this.discoveryAi, 'Discovery unavailable or budget used');
        discovered = true;
        const thing = allowedThings.get(a['thingId']);
        ensure(thing, 'Read the Thing first');
        const stored = await ownedThing(this.pool, job.ownerId, thing.id);
        const candidate = publicDiscoveryCandidate(
          {
            id: thing.id,
            name: thing.name,
            categoryId: thing.categoryId,
            terms: [],
            facts: [],
          },
          stored.data,
        );
        ensure(candidate, 'Public model identifiers are missing');
        const discoveryKey = 'discover:' + thing.id + ':' + a['focus'];
        let found = job.toolResults.find((r) => r.key === discoveryKey)?.result as
          Discovery | undefined;
        const discoverySignal = AbortSignal.any([
          signal,
          AbortSignal.timeout(this.config.discoveryTimeoutMs),
        ]);

        if (!found) {
          found = await awaitWithSignal(
            this.discoveryAi.discover(
              candidate,
              { signal: discoverySignal, record },
              a['focus'] as 'reference' | 'maintenance' | 'products',
            ),
            discoverySignal,
          );
          signal.throwIfAborted();
          job.toolResults.push({ key: discoveryKey, result: found });
          await saveMessage(this.pool, job, { toolResults: job.toolResults });
        }

        await persistDiscovery(
          this.pool,
          this.blobs,
          { id: job.id, ownerId: job.ownerId },
          { thingId: thing.id, candidateId: thing.id, isNew: false },
          found,
          { maxBytes: this.config.maxUploadBytes, signal: discoverySignal },
        );
        found.sources.filter(publicUrl).forEach((url) => refs.push({ url }));
        output = { discovery: found, context: await readThing(thing.id) };
        this.events.publish({ type: 'data.changed', ownerId: job.ownerId });
      } else if (name === 'create_event' || name === 'create_issue') {
        ensure(allowedThings.has(a['thingId']), 'Read the Thing first');
        ensure(a['title'].trim(), 'Title cannot be blank');
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
            const fields = c.fieldSetId
              ? thing.fieldSets.find((s) => s.id === c.fieldSetId)?.fields
              : thing.standaloneFields;
            const field = fields?.find((f) => f.id === c.fieldId);
            ensure(field, 'Unknown field');
            addCard({
              type: 'FIELD',
              thingId: c.id,
              fieldSetId: c.fieldSetId,
              fieldId: field.id,
            });
            refs.push(...field.sourceRefs);
          } else if (c.type === 'THING') addCard({ type: 'THING', thingId: c.id });
          else if (c.type === 'ATTACHMENT') {
            addCard({
              type: 'ATTACHMENT',
              attachmentId: c.id,
              ...(c.page ? { page: c.page } : {}),
            });
            refs.push({
              attachmentId: c.id,
              ...(c.page ? { page: c.page } : {}),
            });
          } else if (c.type === 'EVENT') addCard({ type: 'EVENT', eventId: c.id });
          else if (c.type === 'ISSUE') addCard({ type: 'ISSUE', issueId: c.id });
          else addCard({ type: 'PURCHASABLE', purchasableId: c.id });
        }

        output = { shown: selected.length };
      }

      signal.throwIfAborted();
      await record({ toolCalls: [{ name, resultCount: 1, truncated: false }] });
      return { output };
    };

    try {
      await saveMessage(this.pool, job, { status: 'PROCESSING' });
      this.events.publish({ type: 'data.changed', ownerId: job.ownerId });
      const history = await conversation(this.pool, job.ownerId, job.conversationId);
      const messages = history.messages
        .filter((m) => m.id !== job.id && m.status === 'COMPLETE')
        .map((m) => ({ role: m.role, content: m.text }));

      if (job.thingId) {
        const context = await readThing(job.thingId);
        messages.push({
          role: 'USER',
          content: 'Untrusted active Thing context: ' + JSON.stringify(context),
        });
      }

      for (const receipt of job.toolResults) if (receipt.card) addCard(receipt.card);
      const text = await awaitWithSignal(
        this.ai!.respond(
          {
            messages,
            thingId: job.thingId,
            completedWrites: job.toolResults.filter((r) => r.key.startsWith('create_')),
          },
          execute,
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
      await saveMessage(this.pool, job, {
        text,
        cards,
        sourceRefs: [...new Map(refs.map((r) => [JSON.stringify(r), r])).values()],
        status: 'COMPLETE',
        error: null,
      });
    } catch {
      await saveMessage(this.pool, job, {
        text: live.text,
        cards,
        status: 'FAILED',
        error: shutdown.aborted ? 'interrupted' : signal.aborted ? 'timeout' : 'assistant_failed',
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
