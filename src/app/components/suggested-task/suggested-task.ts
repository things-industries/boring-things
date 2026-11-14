import { Component, inject, input, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { close, loading, scheduleTask } from '../../core/app-icons';
import { TasksStore } from '../../core/state/tasks.store';
import type { Task } from '../../interfaces/task.interface';
import { IconButton } from '../icon-button/icon-button';
import { ImportanceTag } from '../importance-tag/importance-tag';
import { TaskRow } from '../task-row/task-row';

/** A suggested task with its importance, how often it repeats, its source, and Add and Dismiss. */
@Component({
  selector: 'bt-suggested-task',
  imports: [NgIcon, IconButton, ImportanceTag, TaskRow],
  viewProviders: [provideIcons({ close, loading, scheduleTask })],
  templateUrl: './suggested-task.html',
  styleUrl: './suggested-task.scss',
})
export class SuggestedTask {
  private tasks = inject(TasksStore);
  readonly task = input.required<Task>();
  readonly adding = signal(false);

  /** Adds the suggestion to the schedule; the day is chosen for the user. */
  async add() {
    this.adding.set(true);
    await this.tasks.schedule(this.task().id);
    this.adding.set(false);
  }

  dismiss() {
    void this.tasks.close(this.task().id);
  }
}
