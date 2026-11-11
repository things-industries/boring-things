import { Component, input } from '@angular/core';

/**
 * Layout of a task line: a projected `[taskRowLeading]` control, an optional eyebrow,
 * `[taskRowTitle]`, default content below the title and `[taskRowTrailing]` controls. `compact`
 * tightens its vertical padding.
 */
@Component({
  selector: 'bt-task-row',
  templateUrl: './task-row.html',
  styleUrl: './task-row.scss',
  host: { '[class.compact]': 'compact()' },
})
export class TaskRow {
  readonly eyebrow = input<string | null>(null);
  readonly compact = input(false);
}
