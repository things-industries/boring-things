import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TasksStore } from '../../core/state/tasks.store';
import { Dialog } from '../dialog/dialog';
import type { EventRecurrence } from '../../interfaces/event.interface';
import type { Task, TaskRecurrence } from '../../interfaces/task.interface';
import { dayKey } from '../../utils/date.util';

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
  readonly date = signal('');
  readonly repeats = signal(false);
  readonly interval = signal(1);
  readonly unit = signal<EventRecurrence['unit']>('MONTH');
  readonly from = signal<TaskRecurrence['from']>('COMPLETION');
  readonly units: EventRecurrence['unit'][] = ['DAY', 'WEEK', 'MONTH', 'YEAR'];
  readonly formId = `reschedule-task-${nextId++}`;

  constructor() {
    effect(() => {
      const task = this.task();

      if (!task) return;
      this.date.set(task.scheduledOn ?? dayKey(new Date()));
      this.repeats.set(!!task.recurrence);
      this.interval.set(task.recurrence?.interval ?? 1);
      this.unit.set(task.recurrence?.unit ?? 'MONTH');
      this.from.set(task.recurrence?.from ?? 'COMPLETION');
    });
  }

  /** The unit's name, plural unless the interval is one. */
  unitName(unit: EventRecurrence['unit']) {
    const name = unit.toLowerCase();

    return this.interval() === 1 ? name : `${name}s`;
  }

  /** The unit's name as a select option, capitalised. */
  unitOption(unit: EventRecurrence['unit']) {
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
      !!this.date() &&
      (!this.repeats() || (Number.isInteger(this.interval()) && this.interval() >= 1))
    );
  }

  save() {
    const task = this.task();

    if (!task || !this.valid()) return;
    void this.tasks.reschedule(
      task.id,
      this.date(),
      this.repeats() ? { interval: this.interval(), unit: this.unit(), from: this.from() } : null,
    );
    this.close();
  }
}
