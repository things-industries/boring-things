/** Actions shared by Task and Event cards and their followup dialogs. */

import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { EventsStore } from '../../core/state/events.store';
import { IssuesStore } from '../../core/state/issues.store';
import { TasksStore } from '../../core/state/tasks.store';
import { ThingsStore } from '../../core/state/things.store';
import type { AgendaItem, CompletionAction, Task } from '../../interfaces/task.interface';
import type { FollowUpRequest } from '../follow-up-dialog/follow-up-dialog';

@Injectable()
export class TaskActions {
  private tasks = inject(TasksStore);
  private events = inject(EventsStore);
  private issues = inject(IssuesStore);
  private things = inject(ThingsStore);
  private router = inject(Router);
  readonly rescheduling = signal<Task | null>(null);
  readonly answering = signal<FollowUpRequest | null>(null);

  /** Completes an active Task once. */
  toggle(item: AgendaItem) {
    if (item.type === 'TASK' && item.task.status === 'ACTIVE')
      void this.tasks.complete(item.task.id);
  }

  /** Starts a new conversation with server-validated item and followup context. */
  ask(item: AgendaItem, action: Extract<CompletionAction, { type: 'CHAT' }> | null = null) {
    const actions =
      item.type === 'TASK'
        ? item.task.completionActions
        : item.type === 'EVENT'
          ? item.event.completionActions
          : [];
    const context =
      item.type === 'TASK'
        ? { taskId: item.task.id }
        : item.type === 'EVENT'
          ? { eventId: item.event.id }
          : {};
    void this.router.navigate(['/things', item.thingId, 'chat'], {
      queryParams: { ...context, ...(action ? { actionIndex: actions.indexOf(action) } : {}) },
    });
  }

  /** Runs one followup without dismissing the remaining options. */
  async answer(item: AgendaItem, action: CompletionAction) {
    const issueId =
      item.type === 'TASK' ? item.task.issueId : item.type === 'EVENT' ? item.event.issueId : null;
    if (action.type === 'CHAT') this.ask(item, action);
    else if (action.type === 'RESOLVE_ISSUE') {
      if (issueId) await this.issues.resolve(issueId);
    } else {
      await this.things.loadOne(item.thingId);
      this.answering.set({ thingId: item.thingId, action });
    }
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
