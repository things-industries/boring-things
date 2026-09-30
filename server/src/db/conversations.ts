type ChatAttachment = Pick<Schema['Attachment'], 'id' | 'filename' | 'mediaType' | 'byteSize'> & {
  storageKey: string;
};
import { execute } from './connection.js';
/**
 * Persists owner-scoped conversations and queued messages, reads assistant resources and records
 * transactional write receipts for retries.
 */

import type pg from 'pg';
import type { Schema } from '../../../shared/model.js';
import { rows, transaction, type Database } from './connection.js';
import { ownedThing, bumpThing } from './things.js';
import { ensure } from '../application/errors.js';

export type MessageRow = Schema['Message'] & {
  toolResults: {
    key: string;
    result: unknown;
    card?: Schema['ResourceCard'];
  }[];
};

export async function ownedConversation(db: Database, owner: string, id: string, lock = false) {
  const [item] = await rows<{ id: string; thingId: string | null }>(
    db,
    `select id,thing_id from bt.conversations where id=$1 and owner_id=$2${lock ? ' for update' : ''}`,
    [id, owner],
  );
  ensure(item, 'Conversation not found', 'NOT_FOUND');
  return item;
}

export async function conversation(
  db: Database,
  owner: string,
  id: string,
): Promise<Schema['Conversation']> {
  const item = await ownedConversation(db, owner, id);
  const messages = await rows<Schema['Message']>(
    db,
    "select id,conversation_id,request_id,role,text,cards,source_refs,status,error,usage,created_at from bt.messages where conversation_id=$1 order by created_at,case role when 'USER' then 0 else 1 end,id",
    [id],
  );

  // Cards can outlive their targets; recheck owner access so clients can mark deleted resources unavailable.
  for (const message of messages)
    for (const card of message.cards) {
      const table =
        card.type === 'THING' || card.type === 'FIELD'
          ? 'things'
          : card.type === 'ATTACHMENT'
            ? 'attachments'
            : card.type === 'EVENT'
              ? 'events'
              : card.type === 'ISSUE'
                ? 'issues'
                : 'purchasables';

      const key = card.type === 'FIELD' ? 'thingId' : `${card.type.toLowerCase()}Id`;
      const value = (card as unknown as Record<string, unknown>)[key];
      card.available = !!(
        await execute(db, `select 1 from bt.${table} where id=$1 and owner_id=$2`, [value, owner])
      ).rowCount;
    }

  return { ...item, messages };
}

export async function enqueueMessage(
  pool: pg.Pool,
  owner: string,
  id: string,
  input: Schema['MessageInput'],
) {
  ensure(input.text.trim(), 'Message cannot be blank');
  return transaction(pool, async (db) => {
    await ownedConversation(db, owner, id, true);
    const existing = await rows<MessageRow>(
      db,
      'select * from bt.messages where conversation_id=$1 and request_id=$2',
      [id, input.requestId],
    );

    const user = existing.find((m) => m.role === 'USER');
    const assistant = existing.find((m) => m.role === 'ASSISTANT');

    if (user) ensure(user.text === input.text.trim(), 'Request ID already used', 'CONFLICT');

    if (assistant && assistant.status !== 'FAILED') return conversation(db, owner, id);
    ensure(
      !(
        await execute(
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
      const [latest] = await rows<{ id: string }>(
        db,
        "select id from bt.messages where conversation_id=$1 and role='ASSISTANT' order by created_at desc,id desc limit 1",
        [id],
      );
      ensure(latest?.id === assistant.id, 'Only the latest response can be retried', 'CONFLICT');
      await execute(db, "update bt.messages set status='QUEUED',text='',error=null where id=$1", [
        assistant.id,
      ]);
    } else {
      ensure(
        (await execute(db, 'select 1 from bt.messages where conversation_id=$1', [id])).rowCount! <
          80,
        'Conversation limit reached; start a new chat',
        'CONFLICT',
      );
      await execute(
        db,
        "insert into bt.messages(conversation_id,request_id,role,text,status) values($1,$2,'USER',$3,'COMPLETE'),($1,$2,'ASSISTANT','','QUEUED')",
        [id, input.requestId, input.text.trim()],
      );
    }

    return conversation(db, owner, id);
  });
}

export type ChatJob = MessageRow & { ownerId: string; thingId: string | null };

export async function recoverMessages(db: Database) {
  await execute(
    db,
    "update bt.messages set status='FAILED',error='interrupted' where role='ASSISTANT' and status='PROCESSING'",
  );
}

// The shared runner serialises consumption; this query does not claim jobs for multiple worker processes.
export async function nextMessage(db: Database) {
  const [job] = await rows<ChatJob>(
    db,
    "select m.*,c.owner_id,c.thing_id from bt.messages m join bt.conversations c on c.id=m.conversation_id where m.role='ASSISTANT' and m.status='QUEUED' order by m.created_at,m.id limit 1",
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
  await execute(
    db,
    `update bt.messages set ${entries.map(([key], i) => columns[key] + '=$' + (i + 1)).join(',')} where id=$${values.length + 1} and conversation_id in (select id from bt.conversations where owner_id=$${values.length + 2})`,
    [...values, job.id, job.ownerId],
  );
}

export async function searchChatThings(db: Database, owner: string, query: string) {
  return rows<{ id: string; name: string; categoryId: string }>(
    db,
    "select id,name,category_id from bt.things where owner_id=$1 and name ilike '%' || $2 || '%' order by updated_at desc,id limit 21",
    [owner, query],
  );
}

export async function chatResources(db: Database, owner: string, id: string) {
  const attachments = await rows<
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
    'select a.id,a.filename,a.media_type,a.byte_size,a.source_url,a.title,a.document_type,a.publisher,a.document_date::text,a.page_count from bt.attachments a join bt.thing_attachments l on l.attachment_id=a.id where l.thing_id=$1 and a.owner_id=$2 order by a.created_at desc,a.id limit 31',
    [id, owner],
  );

  const activity: Record<string, { id: string }[]> = {};

  for (const [kind, table] of [
    ['event', 'events'],
    ['issue', 'issues'],
    ['purchasable', 'purchasables'],
  ] as const) {
    activity[table] = await rows<{ id: string }>(
      db,
      `select ${kind === 'purchasable' ? 'id,thing_id,kind,name,description,merchant_url,source_refs,checked_at,is_sample' : `id,thing_id,title,description,status,is_sample${kind === 'issue' ? ',status_text,due_date::text' : ''}`}${kind === 'event' ? ',starts_at,starts_on::text,source_refs' : ''} from bt.${table} where thing_id=$1 and owner_id=$2 order by created_at desc,id limit 31`,
      [id, owner],
    );
  }

  return {
    attachments: attachments.slice(0, 30),
    activity: Object.fromEntries(Object.entries(activity).map(([k, v]) => [k, v.slice(0, 30)])),
    truncated: attachments.length > 30 || Object.values(activity).some((v) => v.length > 30),
  };
}

export async function chatAttachment(db: Database, owner: string, id: string) {
  const [file] = await rows<ChatAttachment>(
    db,
    'select id,filename,media_type,storage_key,byte_size from bt.attachments where id=$1 and owner_id=$2',
    [id, owner],
  );

  return file;
}

export async function processingMessage(db: Database, job: ChatJob): Promise<MessageRow> {
  const [current] = await rows<MessageRow>(
    db,
    "select m.* from bt.messages m join bt.conversations c on c.id=m.conversation_id where m.id=$1 and c.owner_id=$2 and m.status='PROCESSING' for update of m",
    [job.id, job.ownerId],
  );
  ensure(current, 'Message is no longer processing', 'CONFLICT');
  return current;
}
export async function createConversation(
  pool: pg.Pool,
  owner: string,
  thingId?: string | null,
): Promise<Schema['Conversation']> {
  return transaction(pool, async (db) => {
    if (thingId) await ownedThing(db, owner, thingId, true);
    const [item] = await rows<{ id: string }>(
      db,
      'insert into bt.conversations(owner_id,thing_id) values($1,$2) returning id',
      [owner, thingId ?? null],
    );
    if (thingId) await bumpThing(db, owner, thingId);
    return conversation(db, owner, item.id);
  });
}
