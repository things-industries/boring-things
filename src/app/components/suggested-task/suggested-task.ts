import { Component, input, output } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import {
  scheduleTask,
  taskCleaning,
  taskInspection,
  taskOther,
  taskRepair,
  taskReplacement,
  taskService,
} from '../../core/app-icons';
import type { Task } from '../../interfaces/task.interface';
import { IconButton } from '../icon-button/icon-button';
import { ListRow } from '../list-row/list-row';
import { ImportanceTag } from '../importance-tag/importance-tag';

/** A suggested task with its importance, how often it repeats, its source and an Add button. */
@Component({
  selector: 'bt-suggested-task',
  imports: [IconButton, ListRow, ImportanceTag],
  viewProviders: [
    provideIcons({
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
  readonly task = input.required<Task>();
  readonly added = output<void>();
}
