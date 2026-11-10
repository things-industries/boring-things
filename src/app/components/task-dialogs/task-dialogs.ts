import { Component, inject } from '@angular/core';
import { RescheduleDialog } from '../reschedule-dialog/reschedule-dialog';
import { TaskActions } from '../task-list/task-actions';

/** The reschedule dialog `TaskActions` opens. Render once per provider. */
@Component({
  selector: 'bt-task-dialogs',
  imports: [RescheduleDialog],
  templateUrl: './task-dialogs.html',
})
export class TaskDialogs {
  readonly actions = inject(TaskActions);
}
