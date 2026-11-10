import { Component, input } from '@angular/core';

/**
 * Layout of a task line: a projected `[taskRowLeading]` control, an optional eyebrow,
 * `[taskRowTitle]`, default content below the title and `[taskRowTrailing]` controls.
 */
@Component({
  selector: 'bt-task-row',
  templateUrl: './task-row.html',
  styleUrl: './task-row.scss',
})
export class TaskRow {
  readonly eyebrow = input<string | null>(null);
}
