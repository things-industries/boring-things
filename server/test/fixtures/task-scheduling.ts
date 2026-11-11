/** Scheduling fixture for tests, with no external AI requests. */

import type { TaskScheduler } from '../../src/application/task-scheduling.js';
export class FixtureTaskScheduler implements TaskScheduler {
  calls = 0;
  schedule: TaskScheduler['schedule'] = async (task, _thing, _history, today) => {
    this.calls++;
    return { scheduledOn: task.scheduledOn ?? today, deadlineOn: task.deadlineOn };
  };
}
