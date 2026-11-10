import { Component, inject, input, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  close,
  loading,
  scheduleTask,
  taskCleaning,
  taskInspection,
  taskOther,
  taskRepair,
  taskReplacement,
  taskService,
} from '../../core/app-icons';
import { TasksStore } from '../../core/state/tasks.store';
import type { Task } from '../../interfaces/task.interface';
import { IconButton } from '../icon-button/icon-button';
import { ListRow } from '../list-row/list-row';
import { ImportanceTag } from '../importance-tag/importance-tag';

/** A suggested task with its importance, how often it repeats, its source, and Add and Dismiss. */
@Component({
  selector: 'bt-suggested-task',
  imports: [NgIcon, IconButton, ListRow, ImportanceTag],
  viewProviders: [
    provideIcons({
      close,
      loading,
      scheduleTask,
      taskCleaning,
      taskInspection,
      taskOther,
      taskRepair,
      taskReplacement,
      taskService,
    }),
  ],
  templateUrl: './suggested-task.html',
  styleUrl: './suggested-task.scss',
})
export class SuggestedTask {
  private tasks = inject(TasksStore);
  readonly task = input.required<Task>();
  /** Shows the task's description, on pages with room for it. */
  readonly showDescription = input(false);
  readonly adding = signal(false);

  /** Adds the suggestion to the schedule; the day is chosen for the owner. */
  async add() {
    this.adding.set(true);
    await this.tasks.schedule(this.task().id);
    this.adding.set(false);
  }

  dismiss() {
    void this.tasks.close(this.task().id);
  }
}
