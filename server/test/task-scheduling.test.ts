/** Scheduling provider coverage using mocked HTTP responses. */

import { setEnvMode } from '../src/config.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Schema } from '../../shared/model.js';
import { ScheduleTask } from '../src/providers/ai/tasks/schedule-task.js';

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
  completedAt: null,
  completedFollowup: null,
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
  setEnvMode('test');
  const schedule = () =>
    new ScheduleTask(
      { task, thing, history: [], today: '2026-11-09' },
      { signal: new AbortController().signal, record: async () => {} },
    ).run();
  assert.deepEqual(await schedule(), output);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].store, false);
  assert.match(String(requests[0].input), /Example policy/);
  assert.match(String(requests[0].instructions), /hard due date/);
  output = { scheduledOn: null, deadlineOn: '2026-12-01' };
  const deadline = await new ScheduleTask(
    {
      task: { ...task, recurrence: { interval: 1, unit: 'YEAR', from: 'COMPLETION' } },
      thing,
      history: [],
      today: '2026-11-09',
    },
    { signal: new AbortController().signal, record: async () => {} },
  ).run();
  assert.deepEqual(deadline, output);
  output = { scheduledOn: '2026-02-30', deadlineOn: null };
  await assert.rejects(schedule(), /Invalid AI output/);
});
