import { Component, inject } from '@angular/core';
import { FollowUpDialog } from '../follow-up-dialog/follow-up-dialog';
import { RescheduleDialog } from '../reschedule-dialog/reschedule-dialog';
import { TaskActions } from '../task-list/task-actions';

/** The reschedule and follow-up dialogs `TaskActions` opens. Render once per provider. */
@Component({
  selector: 'bt-task-dialogs',
  imports: [FollowUpDialog, RescheduleDialog],
  templateUrl: './task-dialogs.html',
})
export class TaskDialogs {
  readonly actions = inject(TaskActions);
}
