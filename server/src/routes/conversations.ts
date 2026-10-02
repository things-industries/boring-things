/**
 * Registers owner-scoped conversation creation, message enqueueing, reads and authenticated
 * snapshot and text streams.
 */

import type { FastifyPluginAsync } from 'fastify';
import type pg from 'pg';
import { route } from '../contracts/routes.js';
import { ensure } from '../application/errors.js';
import {
  conversation,
  ownedConversation,
  enqueueMessage,
  createConversation,
} from '../db/entities/conversations.js';
import type { JobRunner } from '../application/jobs/runner.js';
import type { Assistant } from '../application/conversations/assistant.js';
import type { ApplicationEvents } from '../application/events.js';
import { sseHeaders, type ServerSentEvents } from '../http/sse.js';

interface Options {
  db: pg.Pool;
  runner: JobRunner;
  assistant: Assistant;
  events: ApplicationEvents;
  enabled: boolean;
  sse: ServerSentEvents;
}

const conversationRoutes: FastifyPluginAsync<Options> = async (
  app,
  { db, runner, assistant, events, enabled, sse },
) => {
  route(app, 'POST', '/api/conversations', async (req, reply) => {
    const result = await createConversation(db, req.ownerId, req.body);
    events.publish({ type: 'data.changed', ownerId: req.ownerId });
    return reply.code(201).send(result);
  });

  route(app, 'POST', '/api/conversations/{id}/messages', async (req, reply) => {
    ensure(enabled, 'Assistant is not configured', 'UNAVAILABLE');
    const result = await enqueueMessage(db, req.ownerId, req.params.id, req.body);
    events.publish({ type: 'data.changed', ownerId: req.ownerId });
    runner.wake();
    reply.code(202);
    return result;
  });

  route(app, 'GET', '/api/conversations/{id}/stream', async (req, reply) => {
    await ownedConversation(db, req.ownerId, req.params.id);
    const subscription = events.subscribe({ ownerId: req.ownerId, conversationId: req.params.id });
    return reply
      .headers(sseHeaders)
      .code(200)
      .send(
        sse.stream(subscription, {
          event: 'conversation.snapshot',
          snapshot: () => assistant.snapshot(req.ownerId, req.params.id),
          eventFor: (event) =>
            event.type === 'conversation.delta'
              ? { event: event.type, data: event.delta }
              : undefined,
        }),
      );
  });

  route(app, 'GET', '/api/conversations/{id}', (req) =>
    conversation(db, req.ownerId, req.params.id),
  );
};

export default conversationRoutes;
