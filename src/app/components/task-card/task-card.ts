import { DatePipe, LowerCasePipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  agendaEvent,
  askAboutTask,
  deleteTask,
  followUpChat,
  followUpDocument,
  followUpField,
  followUpResolve,
  goToThing,
  rescheduleTask,
  taskCritical,
  taskDone,
  taskOpen,
  taskOverdue,
} from '../../core/app-icons';
import type { AgendaItem, CompletionAction } from '../../interfaces/task.interface';
import { isDone, itemTitle, timeLine } from '../../utils/agenda.util';
import { daysUntil } from '../../utils/date.util';
import { Menu } from '../menu/menu';
import { IconButton } from '../icon-button/icon-button';
import { MenuItem } from '../menu/menu-item';
import { TaskRow } from '../task-row/task-row';

const actionIcons: Record<CompletionAction['type'], string> = {
  CHAT: 'followUpChat',
  UPDATE_FIELD: 'followUpField',
  ADD_ATTACHMENT: 'followUpDocument',
  RESOLVE_ISSUE: 'followUpResolve',
};

/**
 * Agenda card for a task, appointment or Thing date: a check control for items that can be done,
 * the title, a time line or, once done, its completion actions side by side, and an overflow menu.
 * A Thing date is a compact, shaded card with only a chat action. On a white surface, set
 * `--task-card-background`.
 */
@Component({
  selector: 'bt-task-card',
  imports: [DatePipe, LowerCasePipe, NgIcon, RouterLink, IconButton, Menu, MenuItem, TaskRow],
  viewProviders: [
    provideIcons({
      agendaEvent,
      askAboutTask,
      deleteTask,
      followUpChat,
      followUpDocument,
      followUpField,
      followUpResolve,
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
  host: { '[class.done]': 'done()', '[class.thing-date]': 'thingDate()' },
})
export class TaskCard {
  readonly item = input.required<AgendaItem>();
  readonly now = input(new Date());
  /** Shows the item's day in its meta line, for lists without day headings. */
  readonly showDay = input(false);
  /** Leaves out Go to Thing, on that Thing's pages. */
  readonly inThing = input(false);
  readonly toggled = output<void>();
  readonly actionChosen = output<CompletionAction>();
  readonly asked = output<void>();
  readonly rescheduled = output<void>();
  readonly removed = output<void>();
  readonly dismissed = output<void>();

  readonly title = computed(() => itemTitle(this.item()));
  readonly thingDate = computed(() => this.item().type === 'THING_DATE');

  /** Names the Thing above the title, outside that Thing's pages. */
  readonly showThing = computed(() => !this.inThing());

  readonly actions = computed(() => {
    const item = this.item();

    if (item.type === 'TASK')
      return item.task.status === 'CLOSED' ? [] : item.task.completionActions;
    return item.type === 'EVENT' ? item.event.completionActions : [];
  });

  /** Tasks, and events with completion actions, can be checked off. */
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
  readonly actionIcons = actionIcons;
}
