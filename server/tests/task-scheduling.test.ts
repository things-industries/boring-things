/** Scheduling provider coverage using mocked HTTP responses. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Schema } from '../../shared/model.js';
import { ScheduleTask } from '../src/providers/ai/schedule-task.js';

const task: Schema['Task'] = {
  id: 'task',
  thingId: 'thing',
  issueId: null,
  title: 'Review the policy',
  description: 'Review before the recorded expiry.',
  status: 'SUGGESTED',
  importance: 'IMPORTANT',
  scheduledOn: null,
  deadlineOn: null,
  recurrence: null,
  completionActions: [],
  completedAt: null,
  closedAt: null,
  referenceTaskId: null,
  sourceRefs: [],
  isSample: false,
};
const thing: Schema['Thing'] = {
  id: 'thing',
  name: 'Example policy',
  description: '',
  categoryId: 'insurance',
  revision: 1,
  imageAttachmentId: null,
  tagIds: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  isSample: false,
  fieldSets: [],
  standaloneFields: [],
  customFields: [],
  pinnedFields: [],
  attachmentIds: [],
  issueIds: [],
  eventIds: [],
  purchasableIds: [],
  conversationIds: [],
  accessCount: 0,
  lastViewedAt: null,
};
test('scheduling uses saved context in one structured request and validates returned dates', async (t) => {
  let output: unknown = { scheduledOn: '2026-11-10', deadlineOn: null };
  const requests: Record<string, unknown>[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    requests.push(body);
    return new Response(
      JSON.stringify({
        id: 'schedule',
        status: 'completed',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: JSON.stringify(output) }],
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  });
  const scheduler = new ScheduleTask('fixture-key', 'fixture-model');
  assert.deepEqual(await scheduler.schedule(task, thing, [], '2026-11-09'), output);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].store, false);
  assert.match(String(requests[0].input), /Example policy/);
  assert.match(String(requests[0].instructions), /hard due date/);
  output = { scheduledOn: '2026-02-30', deadlineOn: null };
  await assert.rejects(scheduler.schedule(task, thing, [], '2026-11-09'), /Invalid task schedule/);
});
