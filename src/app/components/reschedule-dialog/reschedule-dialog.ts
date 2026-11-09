import { Component, inject, input, linkedSignal, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TasksStore } from '../../core/state/tasks.store';
import { Dialog } from '../dialog/dialog';
import type { TaskInterval } from '../../interfaces/task.interface';
import type { Task, TaskRecurrence } from '../../interfaces/task.interface';

let nextId = 0;

/**
 * Sets a task's next due date, whether and how often it repeats, and whether the next one counts
 * from completion or the due date. Open while `task` is set.
 */
@Component({
  selector: 'bt-reschedule-dialog',
  imports: [FormsModule, Dialog],
  templateUrl: './reschedule-dialog.html',
  styleUrl: './reschedule-dialog.scss',
})
export class RescheduleDialog {
  private tasks = inject(TasksStore);
  readonly task = input<Task | null>(null);
  readonly closed = output<void>();
  // Each opening sets `task`, which resets the form to the task's schedule.
  readonly date = linkedSignal(() => this.task()?.scheduledOn ?? '');
  readonly deadline = linkedSignal(() => this.task()?.deadlineOn ?? '');
  readonly repeats = linkedSignal(() => !!this.task()?.recurrence);
  readonly interval = linkedSignal(() => this.task()?.recurrence?.interval ?? 1);
  readonly unit = linkedSignal<TaskInterval['unit']>(
    () => this.task()?.recurrence?.unit ?? 'MONTH',
  );
  readonly from = linkedSignal<TaskRecurrence['from']>(
    () => this.task()?.recurrence?.from ?? 'COMPLETION',
  );
  readonly units: TaskInterval['unit'][] = ['DAY', 'WEEK', 'MONTH', 'YEAR'];
  readonly formId = `reschedule-task-${nextId++}`;

  /** The unit's name, plural unless the interval is one. */
  unitName(unit: TaskInterval['unit']) {
    const name = unit.toLowerCase();

    return this.interval() === 1 ? name : `${name}s`;
  }

  /** The unit's name as a select option, capitalised. */
  unitOption(unit: TaskInterval['unit']) {
    const name = this.unitName(unit);

    return name[0].toUpperCase() + name.slice(1);
  }

  /** Selects the number so typing replaces it. */
  selectAll(event: Event) {
    (event.target as HTMLInputElement).select();
  }

  close() {
    this.closed.emit();
  }

  /** Whether the form can be saved: a date, and a whole interval of at least one when repeating. */
  valid() {
    return (
      (!this.date() || !this.deadline() || this.date() <= this.deadline()) &&
      (!this.repeats() ||
        (!!(this.date() || this.deadline()) &&
          Number.isInteger(this.interval()) &&
          this.interval() >= 1 &&
          (this.from() !== 'DEADLINE' || !!this.deadline())))
    );
  }

  async save() {
    const task = this.task();

    if (!task || !this.valid()) return;
    const result = await this.tasks.reschedule(
      task.id,
      this.date() || null,
      this.deadline() || null,
      this.repeats() ? { interval: this.interval(), unit: this.unit(), from: this.from() } : null,
    );
    if (result.ok) this.close();
  }
}
