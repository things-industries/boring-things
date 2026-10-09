import { Component, inject, input } from '@angular/core';
import type { AgendaItem } from '../../interfaces/task.interface';
import { TaskCard } from '../task-card/task-card';
import { TaskActions } from './task-actions';

/** Agenda cards wired to the page's `TaskActions`. */
@Component({
  selector: 'bt-task-list',
  imports: [TaskCard],
  templateUrl: './task-list.html',
  styleUrl: './task-list.scss',
})
export class TaskList {
  readonly actions = inject(TaskActions);
  readonly items = input.required<AgendaItem[]>();
  readonly now = input(new Date());
  /** Shows each item's day, for lists without day headings. */
  readonly showDay = input(false);
  /** Leaves out links to the Thing, for lists on that Thing's pages. */
  readonly inThing = input(false);
}
