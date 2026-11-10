import { DatePipe, LowerCasePipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  agendaEvent,
  agendaThingDate,
  askAboutTask,
  deleteTask,
  followUpChat,
  goToThing,
  rescheduleTask,
  taskCritical,
  taskDone,
  taskOpen,
  taskOverdue,
} from '../../core/app-icons';
import type { AgendaItem } from '../../interfaces/task.interface';
import { isDone, itemTitle, timeLine } from '../../utils/agenda.util';
import { daysUntil } from '../../utils/date.util';
import { Menu } from '../menu/menu';
import { MenuItem } from '../menu/menu-item';

/**
 * Agenda card for a task, appointment or Thing date: a check control for items that can be done,
 * the title, a time line or, once done, a chat followup, and an overflow menu. On a white
 * surface, set `--task-card-background`.
 */
@Component({
  selector: 'bt-task-card',
  imports: [DatePipe, LowerCasePipe, NgIcon, RouterLink, Menu, MenuItem],
  viewProviders: [
    provideIcons({
      agendaEvent,
      agendaThingDate,
      askAboutTask,
      deleteTask,
      followUpChat,
      goToThing,
      rescheduleTask,
      taskCritical,
      taskDone,
      taskOpen,
      taskOverdue,
    }),
  ],
  templateUrl: './task-card.html',
  styleUrl: './task-card.scss',
  host: { '[class.done]': 'done()' },
})
export class TaskCard {
  readonly item = input.required<AgendaItem>();
  readonly now = input(new Date());
  /** Shows the item's day in its meta line, for lists without day headings. */
  readonly showDay = input(false);
  /** Leaves out Go to Thing, on that Thing's pages. */
  readonly inThing = input(false);
  readonly toggled = output<void>();
  readonly followedUp = output<void>();
  readonly asked = output<void>();
  readonly rescheduled = output<void>();
  readonly removed = output<void>();
  readonly dismissed = output<void>();

  readonly title = computed(() => itemTitle(this.item()));

  /** Names the Thing above the title; a Thing date's title already includes it. */
  readonly showThing = computed(() => !this.inThing() && this.item().type !== 'THING_DATE');

  /** Tasks can be checked off. */
  readonly checkable = computed(() => this.item().type === 'TASK');

  readonly done = computed(() => isDone(this.item(), this.now()));

  readonly critical = computed(() => {
    const item = this.item();

    return item.type === 'TASK' && item.task.importance === 'CRITICAL';
  });

  readonly timeLine = computed(() => timeLine(this.item(), this.now()));

  /** Days an open item is overdue by; `null` when it is not. */
  readonly overdueDays = computed(() => {
    const line = this.timeLine();

    return line?.type === 'overdue' ? line.days : null;
  });

  /** Days from today to the item's day. */
  readonly dayOffset = computed(() => daysUntil(this.item().day, this.now()));
}
