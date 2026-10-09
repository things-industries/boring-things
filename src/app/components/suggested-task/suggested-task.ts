import { Component, computed, input, output } from '@angular/core';
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
import { taskBadges } from '../../utils/event.util';
import { IconButton } from '../icon-button/icon-button';
import { ListRow } from '../list-row/list-row';
import { PriorityTag } from '../priority-tag/priority-tag';

/** A suggested task with its priority, how often it repeats, its source and an Add button. */
@Component({
  selector: 'bt-suggested-task',
  imports: [IconButton, ListRow, PriorityTag],
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

  readonly badge = computed(() => taskBadges[this.task().kind]);
}
