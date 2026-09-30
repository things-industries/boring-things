/**
 * Registers owner-scoped conversation creation, message enqueueing, reads and authenticated
 * snapshot and text streams.
 */

import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { route } from '../contracts/routes.js';
import { ensure } from '../application/errors.js';
import { conversation, enqueueMessage, createConversation } from '../db/conversations.js';
import type { JobRunner } from '../application/jobs/runner.js';
import type { Assistant } from '../application/conversations/assistant.js';
import type { OwnerChanges } from '../application/streams.js';
import type { StreamSnapshots } from './stream.js';

export function conversationRoutes(
  app: FastifyInstance,
  db: pg.Pool,
  runner: JobRunner,
  assistant: Assistant,
  changes: OwnerChanges,
  enabled: boolean,
  streams: StreamSnapshots,
) {
  route(app, 'POST', '/api/conversations', async (req, reply) => {
    const result = await createConversation(db, req.ownerId, req.body.thingId);
    changes.publish(req.ownerId);
    return reply.code(201).send(result);
  });

  route(app, 'POST', '/api/conversations/{id}/messages', async (req, reply) => {
    ensure(enabled, 'Assistant is not configured', 'UNAVAILABLE');
    const result = await enqueueMessage(db, req.ownerId, req.params.id, req.body);
    changes.publish(req.ownerId);
    runner.wake();
    reply.code(202);
    return result;
  });

  route(app, 'GET', '/api/conversations/{id}/stream', async (req, reply) => {
    await conversation(db, req.ownerId, req.params.id);
    await streams(reply, {
      event: 'conversation.snapshot',
      snapshot: () => assistant.snapshot(req.ownerId, req.params.id),
      subscribe: (changed) => changes.subscribe(req.ownerId, changed),
      deltas: (send) =>
        assistant.subscribe(req.ownerId, req.params.id, (data) =>
          send({ event: 'conversation.delta', data }),
        ),
    });
  });

  route(app, 'GET', '/api/conversations/{id}', (req) =>
    conversation(db, req.ownerId, req.params.id),
  );
}
