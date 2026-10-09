import { Component, computed, input, linkedSignal, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { expandSection } from '../../core/app-icons';
import { APP_CONFIG } from '../../core/app.config';
import type { Agenda as AgendaDays } from '../../interfaces/task.interface';
import { TaskDialogs } from '../task-dialogs/task-dialogs';
import { TaskActions } from '../task-list/task-actions';
import { TaskList } from '../task-list/task-list';

let nextId = 0;

/**
 * Today, Tomorrow and a collapsible, paginated Upcoming on a connected timeline, with the actions and
 * dialogs of their cards.
 */
@Component({
  selector: 'bt-agenda',
  imports: [DatePipe, NgIcon, TaskDialogs, TaskList],
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
  /** Whether Upcoming starts expanded. */
  readonly expanded = input(false);

  readonly upcomingOpen = linkedSignal(() => this.expanded());
  private readonly upcomingShown = signal<number>(APP_CONFIG.upcomingDayPage);
  readonly upcoming = computed(() => this.agenda().upcoming.slice(0, this.upcomingShown()));
  readonly hasMore = computed(() => this.agenda().upcoming.length > this.upcomingShown());
  readonly id = `agenda-${nextId++}`;

  showMore() {
    this.upcomingShown.update((shown) => shown + APP_CONFIG.upcomingDayPage);
  }
}
