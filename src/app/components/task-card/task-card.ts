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
  followUpDocument,
  followUpField,
  goToThing,
  rescheduleTask,
  taskCritical,
  taskDone,
  taskOpen,
  taskOverdue,
} from '../../core/app-icons';
import type { AgendaItem, FollowUp } from '../../interfaces/task.interface';
import { itemTitle, timeLine } from '../../utils/agenda.util';
import { Menu } from '../menu/menu';
import { MenuItem } from '../menu/menu-item';

const followUpIcons: Record<FollowUp['type'], string> = {
  CHAT: 'followUpChat',
  UPDATE_FIELD: 'followUpField',
  ADD_DOCUMENT: 'followUpDocument',
};

/**
 * Agenda card for a task, appointment or Thing date: a check control for items that can be done,
 * the title, a time line or, once done, the follow-up button, and an overflow menu.
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
      followUpDocument,
      followUpField,
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
  readonly toggled = output<void>();
  readonly followedUp = output<FollowUp>();
  readonly asked = output<void>();
  readonly rescheduled = output<void>();
  readonly removed = output<void>();

  readonly title = computed(() => itemTitle(this.item()));

  readonly followUp = computed(() => {
    const item = this.item();

    if (item.type === 'TASK') return item.task.followUp;
    return item.type === 'EVENT' ? item.event.followUp : null;
  });

  /** Tasks, and events with a follow-up, can be checked off. */
  readonly checkable = computed(() => this.item().type === 'TASK' || !!this.followUp());

  readonly done = computed(() => {
    const item = this.item();

    if (item.type === 'TASK') return item.task.status === 'COMPLETED';
    return item.type === 'EVENT' && item.event.status === 'COMPLETED';
  });

  readonly critical = computed(() => {
    const item = this.item();

    return item.type === 'TASK' && item.task.priority === 'CRITICAL';
  });

  readonly timeLine = computed(() => timeLine(this.item(), this.now()));
  readonly followUpIcons = followUpIcons;
}
