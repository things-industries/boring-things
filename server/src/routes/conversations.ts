/**
 * Registers owner-scoped conversation creation, message enqueueing, reads and authenticated
 * snapshot and text streams.
 */

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import type { Schema } from '../../../shared/model.js';
import { route } from '../contracts/routes.js';
import { rows, transaction } from '../db/connection.js';
import { ensure } from '../application/errors.js';
import { conversation, enqueueMessage } from '../db/conversations.js';
import type { ImportRunner } from '../application/imports.js';
import type { Assistant } from '../application/conversations.js';
import type { ThingChanges } from '../application/streams.js';
import { streamSnapshots } from './stream.js';
import { ownedThing, bumpThing } from '../db/things.js';

export function conversationRoutes(
  app: FastifyInstance,
  db: pg.Pool,
  runner: ImportRunner,
  assistant: Assistant,
  changes: ThingChanges,
  enabled: boolean,
) {
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

  route<Schema['MessageInput']>(
    app,
    'POST',
    '/api/conversations/{id}/messages',
    async (req, reply) => {
      ensure(enabled, 'Assistant is not configured', 503);
      const result = await enqueueMessage(db, req.ownerId, req.params.id, req.body);
      changes.publish(req.ownerId);
      runner.wake();
      reply.code(202);
      return result;
    },
  );

  route(app, 'GET', '/api/conversations/{id}/stream', async (req, reply) => {
    await conversation(db, req.ownerId, req.params.id);
    return streamSnapshots(
      req,
      reply,
      changes,
      'conversation.snapshot',
      async () => assistant.snapshot(req.ownerId, req.params.id),
      assistant,
    );
  });

  route(app, 'GET', '/api/conversations/{id}', (req) =>
    conversation(db, req.ownerId, req.params.id),
  );
}
