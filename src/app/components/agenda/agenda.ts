import { Component, computed, input, signal } from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { expandSection } from '../../core/app-icons';
import { APP_CONFIG } from '../../core/app.config';
import type { Agenda as AgendaDays } from '../../interfaces/task.interface';
import { TaskDialogs } from '../task-dialogs/task-dialogs';
import { TaskActions } from '../task-list/task-actions';
import { TaskList } from '../task-list/task-list';

let nextId = 0;

/**
 * Today, Tomorrow and later days on a connected timeline, with the actions and dialogs of their
 * cards. Later days sit under a collapsible, paginated Upcoming unless `collapsible` is false.
 */
@Component({
  selector: 'bt-agenda',
  imports: [DatePipe, NgTemplateOutlet, NgIcon, TaskDialogs, TaskList],
  providers: [TaskActions],
  viewProviders: [provideIcons({ expandSection })],
  templateUrl: './agenda.html',
  styleUrl: './agenda.scss',
})
export class Agenda {
  readonly agenda = input.required<AgendaDays>();
  readonly now = input(new Date());
  /** Leaves out links to the Thing, for one Thing's agenda. */
  readonly inThing = input(false);
  /** Collapses Upcoming behind a toggle and pages it; otherwise every day shows. */
  readonly collapsible = input(true);

  readonly upcomingOpen = signal(false);
  private readonly upcomingShown = signal<number>(APP_CONFIG.upcomingDayPage);

  readonly upcoming = computed(() => {
    const days = this.agenda().upcoming;

    return this.collapsible() ? days.slice(0, this.upcomingShown()) : days;
  });

  readonly hasMore = computed(() => this.upcoming().length < this.agenda().upcoming.length);
  readonly id = `agenda-${nextId++}`;

  showMore() {
    this.upcomingShown.update((shown) => shown + APP_CONFIG.upcomingDayPage);
  }
}
