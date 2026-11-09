import type pg from 'pg';
import type { Schema } from '../../../../shared/model.js';
import * as database from '../../db/connection.js';
import * as conversationsDb from '../../db/entities/conversations.js';
import type { ChatJob } from '../../db/entities/conversations.js';
import { ensure } from '../errors.js';
import { writeTask } from '../tasks.js';
import type { Registry } from '../registry/registry.js';
import { writeEvent, writeIssue } from '../activity.js';
type ActivityInput = Pick<Schema['IssueInput'], 'thingId' | 'title' | 'description'>;

export async function createChatActivity(
  pool: pg.Pool,
  job: ChatJob,
  name: 'create_task' | 'create_event' | 'create_issue',
  input: ActivityInput & Partial<Schema['TaskInput'] & Schema['EventInput']>,
  registry: Registry,
  signal: AbortSignal,
) {
  return database.transaction(pool, async (db) => {
    signal.throwIfAborted();
    const current = await conversationsDb.getProcessingMessageOrThrow(db, job);
    ensure(current, 'Message is no longer processing', 'CONFLICT');
    const previous = current.toolResults.find(
      (r) => r.key === 'create_task' || r.key === 'create_event' || r.key === 'create_issue',
    );

    if (previous) {
      ensure(
        previous.key === name && (previous.result as { thingId: string }).thingId === input.thingId,
        'One creation per message',
      );

      return previous;
    }

    const activity =
      name === 'create_task'
        ? await writeTask(db, job.ownerId, { ...input, status: 'SUGGESTED' }, registry)
        : name === 'create_event'
          ? await writeEvent(db, job.ownerId, input, registry)
          : await writeIssue(db, job.ownerId, input);
    const item = { id: activity.id, thingId: activity.thingId };

    const card: Schema['ResourceCard'] =
      name === 'create_task'
        ? { type: 'TASK', taskId: item.id }
        : name === 'create_event'
          ? { type: 'EVENT', eventId: item.id }
          : { type: 'ISSUE', issueId: item.id };

    const result = { key: name, result: item, card };
    // Commit the record and receipt together, so retry can reuse its result.
    await conversationsDb.saveMessage(db, job, {
      toolResults: [...current.toolResults, result],
    });
    signal.throwIfAborted();
    return result;
  });
}
