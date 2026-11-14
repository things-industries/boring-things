/**
 * Persists user-scoped conversations and queued messages, reads assistant resources and records
 * transactional write receipts for retries.
 */

import * as database from '../connection.js';
import type { Schema } from '../../../../shared/model.js';
import { mergeResourceCards } from '../../../../shared/resource-cards.js';
import type { Database } from '../connection.js';
import type { ActivityContext } from '../../application/conversations/types.js';
import { ensure } from '../../application/errors.js';
import type { RouteTypes } from '../../contracts/routes.js';
import { page, pageResult } from '../../application/pagination.js';

type ChatAttachment = Pick<Schema['Attachment'], 'id' | 'filename' | 'mediaType' | 'byteSize'> & {
  storageKey: string;
};

type ConversationQuery = RouteTypes<'/api/conversations', 'get'>['Querystring'];

export async function listConversations(
  db: Database,
  userId: string,
  query: ConversationQuery,
): Promise<Schema['ConversationSummaryList']> {
  const { limit, offset } = page(query);
  const items = await database.rows<Schema['ConversationSummary']>(
    db,
    `select c.id,c.thing_id,c.created_at,
      (select text from bt.messages where conversation_id=c.id and role='USER'
        order by created_at,id limit 1) as title,
      m.message_count,coalesce(m.last_message_at,c.created_at) as last_message_at
    from bt.conversations c
    cross join lateral (
      select count(*)::integer as message_count,max(created_at) as last_message_at
      from bt.messages where conversation_id=c.id
    ) m
    where c.user_id=$1 and ($2::uuid is null or c.thing_id=$2) and m.message_count >= $3
    order by last_message_at desc,c.id limit $4 offset $5`,
    [userId, query.thingId ?? null, query.minMessageCount ?? 0, limit + 1, offset],
  );
  return pageResult(
    items.map((item) => ({
      ...item,
      title: item.title === null ? null : [...item.title.trim()].slice(0, 80).join(''),
    })),
    query,
  );
}

export type MessageRow = Schema['Message'] & {
  toolResults: {
    key: string;
    result: unknown;
    card?: Schema['ResourceCard'];
    cards?: Schema['ResourceCard'][];
  }[];
};

export async function getConversationForUserOrThrow(
  db: Database,
  userId: string,
  id: string,
  lock = false,
) {
  const [item] = await database.rows<{
    id: string;
    thingId: string | null;
    activityContext: ActivityContext | null;
  }>(
    db,
    `select id,thing_id,activity_context from bt.conversations where id=$1 and user_id=$2${lock ? ' for update' : ''}`,
    [id, userId],
  );
  ensure(item, 'Conversation not found', 'NOT_FOUND');
  return item;
}

export async function getConversationSnapshotForUser(
  db: Database,
  userId: string,
  id: string,
): Promise<Schema['Conversation']> {
  const item = await getConversationForUserOrThrow(db, userId, id);
  const messages = await database.rows<Schema['Message']>(
    db,
    "select id,conversation_id,request_id,role,text,cards,source_refs,status,error,usage,created_at from bt.messages where conversation_id=$1 order by created_at,case role when 'USER' then 0 else 1 end,id",
    [id],
  );

  for (const message of messages) {
    message.cards = mergeResourceCards([
      ...message.cards,
      ...message.sourceRefs.flatMap<Schema['ResourceCard']>(({ attachmentId, page }) =>
        attachmentId ? [{ type: 'ATTACHMENT', attachmentId, ...(page ? { page } : {}) }] : [],
      ),
    ]);
    message.sourceRefs = [];
  }

  // Cards can outlive their targets; recheck user access so clients can mark deleted resources unavailable.
  for (const message of messages)
    for (const card of message.cards) {
      const table =
        card.type === 'THING' || card.type === 'FIELD'
          ? 'things'
          : card.type === 'ATTACHMENT'
            ? 'attachments'
            : card.type === 'EVENT'
              ? 'events'
              : card.type === 'TASK'
                ? 'tasks'
                : card.type === 'ISSUE'
                  ? 'issues'
                  : 'purchasables';

      const key = card.type === 'FIELD' ? 'thingId' : `${card.type.toLowerCase()}Id`;
      const value = (card as unknown as Record<string, unknown>)[key];
      card.available = !!(
        await database.execute(db, `select 1 from bt.${table} where id=$1 and user_id=$2`, [
          value,
          userId,
        ])
      ).rowCount;
    }

  return { ...item, messages };
}

export type ChatJob = MessageRow & {
  userId: string;
  thingId: string | null;
  queuedAt: string | null;
};

export async function recoverMessages(db: Database) {
  await database.execute(
    db,
    "update bt.messages set status='FAILED',error='interrupted' where role='ASSISTANT' and status='PROCESSING'",
  );
}

// The shared runner serialises consumption; this query does not claim jobs for multiple worker processes.
export async function getNextQueuedMessage(db: Database) {
  const [job] = await database.rows<ChatJob>(
    db,
    "select m.*,c.user_id,c.thing_id from bt.messages m join bt.conversations c on c.id=m.conversation_id where m.role='ASSISTANT' and m.status='QUEUED' order by m.created_at,m.id limit 1",
  );

  return job;
}

export async function saveMessage(
  db: Database,
  job: ChatJob,
  patch: Partial<
    Pick<MessageRow, 'text' | 'status' | 'cards' | 'sourceRefs' | 'toolResults' | 'usage' | 'error'>
  >,
) {
  const columns = {
    text: 'text',
    status: 'status',
    cards: 'cards',
    sourceRefs: 'source_refs',
    toolResults: 'tool_results',
    usage: 'usage',
    error: 'error',
  } as const;

  const entries = Object.entries(patch) as [keyof typeof columns, unknown][];
  const values = entries.map(([key, value]) =>
    ['cards', 'sourceRefs', 'toolResults', 'usage'].includes(key) ? JSON.stringify(value) : value,
  );
  await database.execute(
    db,
    `update bt.messages set ${entries.map(([key], i) => columns[key] + '=$' + (i + 1)).join(',')} where id=$${values.length + 1} and conversation_id in (select id from bt.conversations where user_id=$${values.length + 2})`,
    [...values, job.id, job.userId],
  );
}

export async function searchChatThings(db: Database, userId: string, query: string) {
  return database.rows<{ id: string; name: string; categoryId: string }>(
    db,
    "select id,name,category_id from bt.things where user_id=$1 and name ilike '%' || $2 || '%' order by updated_at desc,id limit 21",
    [userId, query],
  );
}

export async function getChatResourcesForUser(db: Database, userId: string, id: string) {
  const attachments = await database.rows<
    Pick<
      Schema['Attachment'],
      | 'id'
      | 'filename'
      | 'mediaType'
      | 'byteSize'
      | 'sourceUrl'
      | 'title'
      | 'documentType'
      | 'publisher'
      | 'documentDate'
      | 'pageCount'
    >
  >(
    db,
    'select a.id,a.filename,a.media_type,a.byte_size,a.source_url,a.title,a.document_type,a.publisher,a.document_date::text,a.page_count from bt.attachments a join bt.thing_attachments l on l.attachment_id=a.id where l.thing_id=$1 and l.user_id=$2 order by a.created_at desc,a.id limit 31',
    [id, userId],
  );

  const records: Record<string, { id: string }[]> = {};

  for (const [kind, table] of [
    ['event', 'events'],
    ['task', 'tasks'],
    ['issue', 'issues'],
    ['purchasable', 'purchasables'],
  ] as const) {
    records[table] = await database.rows<{ id: string }>(
      db,
      `select ${kind === 'purchasable' ? 'id,thing_id,kind,name,description,merchant_url,source_refs,checked_at,is_sample' : `id,thing_id,title,description,status,is_sample${kind === 'issue' ? ',status_text,due_date::text' : ',issue_id'}`}${kind === 'event' ? ',starts_at,starts_on::text,ends_at,closed_at,completed_followup,source_refs' : kind === 'task' ? ',importance,scheduled_on::text,deadline_on::text,recurrence,completed_at,closed_at,completed_followup,source_refs' : ''} from bt.${table} where thing_id=$1 and user_id=$2 order by created_at desc,id limit 31`,
      [id, userId],
    );
  }

  return {
    attachments: attachments.slice(0, 30),
    events: records.events.slice(0, 30),
    tasks: records.tasks.slice(0, 30),
    issues: records.issues.slice(0, 30),
    purchasables: records.purchasables.slice(0, 30),
    truncated: attachments.length > 30 || Object.values(records).some((v) => v.length > 30),
  };
}

export async function getChatAttachmentForUserOrThrow(db: Database, userId: string, id: string) {
  const [file] = await database.rows<ChatAttachment>(
    db,
    'select id,filename,media_type,storage_key,byte_size from bt.attachments where id=$1 and user_id=$2',
    [id, userId],
  );

  return file;
}

export async function getProcessingMessageOrThrow(db: Database, job: ChatJob): Promise<MessageRow> {
  const [current] = await database.rows<MessageRow>(
    db,
    "select m.* from bt.messages m join bt.conversations c on c.id=m.conversation_id where m.id=$1 and c.user_id=$2 and m.status='PROCESSING' for update of m",
    [job.id, job.userId],
  );
  ensure(current, 'Message is no longer processing', 'CONFLICT');
  return current;
}

/** Queues or retries messages in a locked conversation, reporting the first message. */
export async function queueMessage(
  db: Database,
  id: string,
  input: Schema['MessageInput'],
): Promise<'first' | 'queued' | 'retried' | 'unchanged'> {
  const existing = await database.rows<MessageRow>(
    db,
    'select * from bt.messages where conversation_id=$1 and request_id=$2',
    [id, input.requestId],
  );

  const user = existing.find((m) => m.role === 'USER');
  const assistant = existing.find((m) => m.role === 'ASSISTANT');

  if (user) ensure(user.text === input.text.trim(), 'Request ID already used', 'CONFLICT');

  if (assistant && assistant.status !== 'FAILED') return 'unchanged';
  ensure(
    !(
      await database.execute(
        db,
        "select 1 from bt.messages where conversation_id=$1 and role='ASSISTANT' and status in ('QUEUED','PROCESSING')",
        [id],
      )
    ).rowCount,
    'A response is already in progress',
    'CONFLICT',
  );

  // Requeue the same message without clearing tool receipts, so successful writes survive a failed response.
  if (assistant) {
    // Earlier failed turns cannot be retried after the conversation has moved on.
    const [latest] = await database.rows<{ id: string }>(
      db,
      "select id from bt.messages where conversation_id=$1 and role='ASSISTANT' order by created_at desc,id desc limit 1",
      [id],
    );
    ensure(latest?.id === assistant.id, 'Only the latest response can be retried', 'CONFLICT');
    await database.execute(
      db,
      "update bt.messages set status='QUEUED',text='',error=null,queued_at=now() where id=$1",
      [assistant.id],
    );
  } else {
    const count = (
      await database.execute(db, 'select 1 from bt.messages where conversation_id=$1', [id])
    ).rowCount!;
    ensure(count < 80, 'Conversation limit reached; start a new chat', 'CONFLICT');
    await database.execute(
      db,
      "insert into bt.messages(conversation_id,request_id,role,text,status) values($1,$2,'USER',$3,'COMPLETE'),($1,$2,'ASSISTANT','','QUEUED')",
      [id, input.requestId, input.text.trim()],
    );
    return count === 0 ? 'first' : 'queued';
  }
  return 'retried';
}

/** Finds the conversation already opened for an item's followup. */
export async function findFollowupConversation(db: Database, userId: string, itemId: string) {
  const [existing] = await database.rows<{ id: string }>(
    db,
    'select id from bt.conversations where user_id=$1 and activity_context @> $2::jsonb order by created_at,id limit 1',
    [userId, JSON.stringify({ item: { id: itemId }, followup: true })],
  );
  return existing?.id;
}

/** Inserts a conversation with its authorised item and Issue context. */
export async function insertConversation(
  db: Database,
  userId: string,
  input: Pick<Schema['ConversationInput'], 'id' | 'thingId'> & {
    activityContext: ActivityContext | null;
  },
) {
  const [item] = await database.rows<{ id: string }>(
    db,
    'insert into bt.conversations(user_id,thing_id,id,activity_context) values($1,$2,coalesce($3::uuid,gen_random_uuid()),$4) returning id',
    [userId, input.thingId ?? null, input.id, JSON.stringify(input.activityContext)],
  );
  return item.id;
}
