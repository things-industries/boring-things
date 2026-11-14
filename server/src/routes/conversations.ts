/**
 * Registers user-scoped conversation creation, message enqueueing, reads and authenticated
 * snapshot and text streams.
 */

import type { FastifyPluginAsync } from 'fastify';
import type pg from 'pg';
import { route } from '../contracts/routes.js';
import { ensure } from '../application/errors.js';
import * as conversationsDb from '../db/entities/conversations.js';
import { createConversation, enqueueMessage } from '../application/conversations/lifecycle.js';
import type { JobRunner } from '../application/jobs/runner.js';
import type { Assistant } from '../application/conversations/assistant.js';
import type { ApplicationEvents } from '../application/events.js';
import { sseHeaders, type ServerSentEvents } from '../http/sse.js';
import { getRequestContext } from '../http/logging.js';

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
  route(app, 'GET', '/api/conversations', (req) =>
    conversationsDb.listConversations(db, req.userId, req.query),
  );

  route(app, 'POST', '/api/conversations', async (req, reply) => {
    ensure(!req.body.followup || enabled, 'Assistant is not configured', 'UNAVAILABLE');
    const result = await createConversation(db, req.userId, req.body);
    events.publish({ type: 'data.changed', userId: req.userId });
    runner.wake();
    return reply.code(201).send(result);
  });

  route(app, 'POST', '/api/conversations/{id}/messages', async (req, reply) => {
    ensure(enabled, 'Assistant is not configured', 'UNAVAILABLE');
    const { outcome, conversation } = await enqueueMessage(db, req.userId, req.params.id, req.body);
    const message = conversation.messages.find(
      (item) => item.role === 'ASSISTANT' && item.requestId === req.body.requestId,
    );
    if (outcome !== 'unchanged' && message)
      req.log.info(
        {
          event: outcome === 'retried' ? 'job_retried' : 'job_queued',
          ...getRequestContext(req),
          jobKind: 'chat',
          jobId: message.id,
          messageId: message.id,
          conversationId: conversation.id,
          thingId: conversation.thingId,
        },
        'Assistant turn queued',
      );
    events.publish({ type: 'data.changed', userId: req.userId });
    runner.wake();
    reply.code(202);
    return conversation;
  });

  route(app, 'GET', '/api/conversations/{id}/stream', async (req, reply) => {
    await conversationsDb.getConversationForUserOrThrow(db, req.userId, req.params.id);
    const subscription = events.subscribe({ userId: req.userId, conversationId: req.params.id });
    return reply
      .headers(sseHeaders)
      .code(200)
      .send(
        sse.stream(subscription, {
          event: 'conversation.snapshot',
          diagnostics: { request: req, conversationId: req.params.id },
          snapshot: () => assistant.snapshot(req.userId, req.params.id),
          eventFor: (event) =>
            event.type === 'conversation.delta'
              ? { event: event.type, data: event.delta }
              : undefined,
        }),
      );
  });

  route(app, 'GET', '/api/conversations/{id}', (req) =>
    conversationsDb.getConversationSnapshotForUser(db, req.userId, req.params.id),
  );
};

export default conversationRoutes;
