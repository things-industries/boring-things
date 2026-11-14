/** Conversation creation and atomic message acceptance with Task and Event followups. */

import type pg from 'pg';
import type { Schema } from '../../../../shared/model.js';
import * as database from '../../db/connection.js';
import type { Database } from '../../db/connection.js';
import * as conversationsDb from '../../db/entities/conversations.js';
import * as tasksDb from '../../db/entities/tasks.js';
import * as activityDb from '../../db/entities/activity.js';
import * as thingsDb from '../../db/entities/things.js';
import { getLocalDate } from '../task-recurrence.js';
import { ensure } from '../errors.js';
import type { ActivityContext } from './types.js';

/** Queues a user message and records the first followup in the same transaction. */
export async function enqueueMessage(
  pool: pg.Pool,
  userId: string,
  id: string,
  input: Schema['MessageInput'],
) {
  ensure(input.text.trim(), 'Message cannot be blank');
  return database.transaction(pool, async (db) => {
    const initial = await conversationsDb.getConversationForUserOrThrow(db, userId, id);
    if (initial.activityContext?.followup && initial.thingId)
      await thingsDb.getThingForUserOrThrow(db, userId, initial.thingId, { lock: true });
    const conversation = await conversationsDb.getConversationForUserOrThrow(db, userId, id, true);
    const outcome = await conversationsDb.queueMessage(db, id, input);
    if (outcome === 'first' && conversation.activityContext?.followup)
      await recordChatFollowup(db, userId, id, conversation.activityContext);
    return {
      outcome,
      conversation: await conversationsDb.getConversationSnapshotForUser(db, userId, id),
    };
  });
}

/** Opens item context, reusing a followup conversation until and after the user answers. */
export async function createConversation(
  pool: pg.Pool,
  userId: string,
  input: Schema['ConversationInput'],
): Promise<Schema['Conversation']> {
  let { thingId } = input;
  return database.transaction(pool, async (db) => {
    ensure(!(input.taskId && input.eventId), 'Choose one task or event');
    let activity = input.taskId
      ? await tasksDb.getTaskForUserOrThrow(db, userId, input.taskId)
      : input.eventId
        ? await activityDb.getActivityForUserOrThrow(db, userId, 'events', input.eventId)
        : null;
    ensure(!input.followup || activity, 'Chat followup needs a task or event');
    if (activity) {
      ensure(!thingId || thingId === activity.thingId, 'Thing does not match item');
      thingId = activity.thingId;
    }
    if (thingId) await thingsDb.getThingForUserOrThrow(db, userId, thingId, { lock: true });
    if (input.taskId)
      activity = await tasksDb.getTaskForUserOrThrow(db, userId, input.taskId, true);
    else if (input.eventId)
      activity = await activityDb.getActivityForUserOrThrow(db, userId, 'events', input.eventId, {
        lock: true,
      });
    if (input.followup && activity) {
      if (activity.completedFollowup?.conversationId)
        return conversationsDb.getConversationSnapshotForUser(
          db,
          userId,
          activity.completedFollowup.conversationId,
        );
      ensure(activity.status !== 'CLOSED', 'Chat followup unavailable', 'CONFLICT');
      ensure(
        'completedAt' in activity
          ? activity.status === 'COMPLETED'
          : hasEventEnded(activity, input.timeZone ?? 'UTC'),
        'Item has not ended',
      );
      const existing = await conversationsDb.findFollowupConversation(db, userId, activity.id);
      if (existing) return conversationsDb.getConversationSnapshotForUser(db, userId, existing);
    }
    const issue = activity?.issueId
      ? await activityDb.getActivityForUserOrThrow(db, userId, 'issues', activity.issueId)
      : null;
    const context: ActivityContext | null = activity
      ? { item: activity, issue, followup: input.followup ?? false, timeZone: input.timeZone }
      : null;
    const id = await conversationsDb.insertConversation(db, userId, {
      id: input.id,
      thingId,
      activityContext: context,
    });
    return conversationsDb.getConversationSnapshotForUser(db, userId, id);
  });
}

/** Records the first user message as a followup and closes the item in the message transaction. */
async function recordChatFollowup(
  db: Database,
  userId: string,
  conversationId: string,
  context: ActivityContext,
) {
  const completedAt = new Date().toISOString();
  const completedFollowup = { conversationId, completedAt };
  if ('completedAt' in context.item) {
    const task = await tasksDb.getTaskForUserOrThrow(db, userId, context.item.id, true);
    ensure(task.status === 'COMPLETED', 'Task followup unavailable', 'CONFLICT');
    await tasksDb.saveTask(
      db,
      userId,
      { ...task, status: 'CLOSED', closedAt: completedAt, completedFollowup },
      true,
    );
  } else {
    const event = await activityDb.getActivityForUserOrThrow(
      db,
      userId,
      'events',
      context.item.id,
      {
        lock: true,
      },
    );
    ensure(event.status === 'SCHEDULED', 'Event followup unavailable', 'CONFLICT');
    ensure(hasEventEnded(event, context.timeZone ?? 'UTC'), 'Item has not ended', 'CONFLICT');
    await activityDb.saveEvent(
      db,
      userId,
      { ...event, status: 'CLOSED', closedAt: completedAt, completedFollowup },
      event.id,
    );
  }
  await thingsDb.bumpThing(db, userId, context.item.thingId);
}

/** Checks timed Event endings or the end of a date-only Event's local day. */
function hasEventEnded(event: Schema['Event'], timeZone: string) {
  const now = new Date();
  return event.startsAt
    ? new Date(event.endsAt ?? event.startsAt) <= now
    : !!event.startsOn && event.startsOn < getLocalDate(now, timeZone);
}
