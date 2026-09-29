import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { Schema } from '../../../shared/model.js';
import { route } from '../contracts/routes.js';
import { rows, transaction, type Database } from '../db/connection.js';
import { ensure } from '../application/errors.js';
import { ownedThing, bumpThing } from '../db/things.js';
export async function conversation(db: Database, owner: string, id: string) {
  const [item] = await rows<Schema['Conversation']>(
    db,
    'select id,thing_id from bt.conversations where id=$1 and owner_id=$2',
    [id, owner],
  );
  ensure(item, 'Conversation not found', 404);
  const messages = await rows<Schema['Message']>(
    db,
    'select id,conversation_id,request_id,role,text,cards,source_refs,status,created_at from bt.messages where conversation_id=$1 order by created_at,id',
    [id],
  );
  return { ...item, messages };
}
export function conversationRoutes(app: FastifyInstance, db: pg.Pool) {
  route<Schema['ConversationInput']>(app, 'POST', '/api/conversations', async (req, reply) =>
    transaction(db, async (tx) => {
      if (req.body.thingId) await ownedThing(tx, req.ownerId, req.body.thingId, true);
      const [item] = await rows<{ id: string }>(
        tx,
        'insert into bt.conversations(owner_id,thing_id) values($1,$2) returning id',
        [req.ownerId, req.body.thingId ?? null],
      );
      if (req.body.thingId) await bumpThing(tx, req.ownerId, req.body.thingId);
      reply.code(201);
      return conversation(tx, req.ownerId, item.id);
    }),
  );
  route(app, 'GET', '/api/conversations/{id}', (req) =>
    conversation(db, req.ownerId, req.params.id),
  );
}
