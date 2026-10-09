import { Component, input } from '@angular/core';
import type { TaskPriority } from '../../interfaces/task.interface';

/** A task's priority as a small coloured label. */
@Component({
  selector: 'bt-priority-tag',
  templateUrl: './priority-tag.html',
  styleUrl: './priority-tag.scss',
  host: { '[class]': 'priority().toLowerCase()' },
})
export class PriorityTag {
  readonly priority = input.required<TaskPriority>();
}
