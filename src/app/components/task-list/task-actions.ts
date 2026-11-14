/** Actions shared by Task and Event cards. */

import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { EventsStore } from '../../core/state/events.store';
import { TasksStore } from '../../core/state/tasks.store';
import type { AgendaItem, Task } from '../../interfaces/task.interface';

@Injectable()
export class TaskActions {
  private tasks = inject(TasksStore);
  private events = inject(EventsStore);
  private router = inject(Router);
  readonly rescheduling = signal<Task | null>(null);

  /** Completes an active Task, or reopens a completed one with no actioned followup. */
  toggle(item: AgendaItem) {
    if (item.type !== 'TASK') return;
    if (item.task.status === 'ACTIVE') void this.tasks.complete(item.task.id);
    else if (item.task.status === 'COMPLETED' && !item.task.completedFollowup)
      void this.tasks.reopen(item.task.id);
  }

  /** Opens chat with item context, optionally recording a followup after the first user message. */
  ask(item: AgendaItem, followup = false) {
    const context =
      item.type === 'TASK'
        ? { taskId: item.task.id }
        : item.type === 'EVENT'
          ? { eventId: item.event.id }
          : {};
    void this.router.navigate(['/things', item.thingId, 'chat'], {
      queryParams: { ...context, ...(followup ? { followup: true } : {}) },
    });
  }

  reschedule(item: AgendaItem) {
    if (item.type === 'TASK') this.rescheduling.set(item.task);
  }
  remove(item: AgendaItem) {
    if (item.type === 'TASK') void this.tasks.remove(item.task.id);
  }
  close(item: AgendaItem) {
    if (item.type === 'TASK') void this.tasks.close(item.task.id);
    else if (item.type === 'EVENT') void this.events.close(item.event.id);
  }
}
