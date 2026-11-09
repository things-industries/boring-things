import { Component, input } from '@angular/core';
import type { TaskImportance } from '../../interfaces/task.interface';

/** A task's importance as a small coloured label. */
@Component({
  selector: 'bt-importance-tag',
  templateUrl: './importance-tag.html',
  styleUrl: './importance-tag.scss',
  host: { '[class]': 'importance().toLowerCase()' },
})
export class ImportanceTag {
  readonly importance = input.required<TaskImportance>();
}
