import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { expandSection, openProfile } from '../../core/app-icons';
import { APP_CONFIG } from '../../core/app.config';
import { mockChatDraft } from '../../core/mocks/tasks.mock';
import { EventsStore } from '../../core/state/events.store';
import { TasksStore } from '../../core/state/tasks.store';
import { agendaView, loadAgenda } from '../../core/state/views/agenda.view';
import { ErrorMessage } from '../../components/error-message/error-message';
import { IconButton } from '../../components/icon-button/icon-button';
import { TaskCard } from '../../components/task-card/task-card';
import type { AgendaItem, FollowUp, Task } from '../../interfaces/task.interface';
import { TermPipe } from '../../pipes/term.pipe';
import { itemTitle } from '../../utils/agenda.util';
import { FollowUpDialog, type FollowUpRequest } from './follow-up-dialog/follow-up-dialog';
import { RescheduleDialog } from './reschedule-dialog/reschedule-dialog';
import { TasksSkeleton } from './tasks-skeleton/tasks-skeleton';

@Component({
  selector: 'bt-tasks',
  imports: [
    DatePipe,
    NgTemplateOutlet,
    RouterLink,
    NgIcon,
    ErrorMessage,
    IconButton,
    TaskCard,
    TasksSkeleton,
    RescheduleDialog,
    FollowUpDialog,
    TermPipe,
  ],
  viewProviders: [provideIcons({ expandSection, openProfile })],
  templateUrl: './tasks.page.html',
  styleUrl: './tasks.page.scss',
})
export class TasksPage {
  private tasks = inject(TasksStore);
  private events = inject(EventsStore);
  private router = inject(Router);
  private collections = loadAgenda();

  readonly now = signal(new Date());
  readonly agenda = agendaView(this.now);
  readonly loaded = this.collections.loaded;
  readonly error = this.collections.error;

  readonly upcomingOpen = signal(false);
  readonly rescheduling = signal<Task | null>(null);
  readonly answering = signal<FollowUpRequest | null>(null);
  private readonly upcomingShown = signal<number>(APP_CONFIG.upcomingDayPage);
  readonly upcoming = computed(() => this.agenda().upcoming.slice(0, this.upcomingShown()));
  readonly hasMore = computed(() => this.agenda().upcoming.length > this.upcomingShown());

  retry() {
    this.collections.retry();
  }

  showMore() {
    this.upcomingShown.update((shown) => shown + APP_CONFIG.upcomingDayPage);
  }

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

  /** Opens a new Thing chat about the item. */
  ask(item: AgendaItem, followUp = false) {
    void this.router.navigate(['/things', item.thingId, 'chat'], {
      queryParams: { draft: mockChatDraft(itemTitle(item), followUp) },
    });
  }

  answer(item: AgendaItem, followUp: FollowUp) {
    if (followUp.type === 'CHAT') this.ask(item, true);
    else this.answering.set({ thingId: item.thingId, followUp });
  }

  remove(item: AgendaItem) {
    if (item.type === 'TASK') void this.tasks.unschedule(item.task.id);
  }
}
