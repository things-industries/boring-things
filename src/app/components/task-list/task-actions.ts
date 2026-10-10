import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { mockChatDraft } from '../../core/mocks/tasks.mock';
import { EventsStore } from '../../core/state/events.store';
import { IssuesStore } from '../../core/state/issues.store';
import { TasksStore } from '../../core/state/tasks.store';
import type { AgendaItem, CompletionAction, Task } from '../../interfaces/task.interface';
import { itemTitle } from '../../utils/agenda.util';
import type { FollowUpRequest } from '../follow-up-dialog/follow-up-dialog';

/**
 * What agenda cards do, and the dialogs they open. A page that lists tasks provides it and renders
 * `bt-task-dialogs` once; `bt-agenda` provides its own.
 */
@Injectable()
export class TaskActions {
  private tasks = inject(TasksStore);
  private events = inject(EventsStore);
  private issues = inject(IssuesStore);
  private router = inject(Router);

  readonly rescheduling = signal<Task | null>(null);
  readonly answering = signal<FollowUpRequest | null>(null);

  /** Checks an item off, or reopens it. */
  toggle(item: AgendaItem) {
    if (item.type === 'TASK') {
      const { id, status } = item.task;

      void (status === 'COMPLETED' ? this.tasks.reopen(id) : this.tasks.complete(id));
    } else if (item.type === 'EVENT') {
      const { id, status } = item.event;

      void (status === 'COMPLETED'
        ? this.events.update(id, { status: 'SCHEDULED' })
        : this.events.complete(id));
    }
  }

  /** Opens a new Thing chat about the item and its issue, following up on `action` if given. */
  ask(item: AgendaItem, action: Extract<CompletionAction, { type: 'CHAT' }> | null = null) {
    const issueId = itemIssueId(item);
    const issueTitle = (issueId && this.issues.entityMap()[issueId]?.title) || null;

    void this.router.navigate(['/things', item.thingId, 'chat'], {
      queryParams: { draft: mockChatDraft(itemTitle(item), issueTitle, action) },
    });
  }

  /** Takes a completion action: a chat, resolving the item's issue, or a field or document dialog. */
  answer(item: AgendaItem, action: CompletionAction) {
    const issueId = itemIssueId(item);

    if (action.type === 'CHAT') this.ask(item, action);
    else if (action.type === 'RESOLVE_ISSUE') {
      if (issueId) void this.issues.resolve(issueId);
    } else this.answering.set({ thingId: item.thingId, action });
  }

  reschedule(item: AgendaItem) {
    if (item.type === 'TASK') this.rescheduling.set(item.task);
  }

  /** Returns a task to its Thing's suggestions. */
  remove(item: AgendaItem) {
    if (item.type === 'TASK') void this.tasks.unschedule(item.task.id);
  }
}

function itemIssueId(item: AgendaItem): string | null {
  if (item.type === 'TASK') return item.task.issueId;
  return item.type === 'EVENT' ? item.event.issueId : null;
}
