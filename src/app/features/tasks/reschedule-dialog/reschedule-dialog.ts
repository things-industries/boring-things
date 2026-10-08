import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TasksStore } from '../../../core/state/tasks.store';
import { Dialog } from '../../../components/dialog/dialog';
import type { EventRecurrence } from '../../../interfaces/event.interface';
import type { Task } from '../../../interfaces/task.interface';
import { dayKey } from '../../../utils/date.util';

let nextId = 0;

/** Moves a task to a new date and sets how often it repeats. Open while `task` is set. */
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
  readonly interval = signal(1);
  readonly unit = signal<EventRecurrence['unit'] | ''>('');
  readonly formId = `reschedule-task-${nextId++}`;

  constructor() {
    effect(() => {
      const task = this.task();

      if (!task) return;
      this.date.set(task.scheduledOn ?? dayKey(new Date()));
      this.interval.set(task.recurrence?.interval ?? 1);
      this.unit.set(task.recurrence?.unit ?? '');
    });
  }

  close() {
    this.closed.emit();
  }

  save() {
    const task = this.task();
    const unit = this.unit();
    const interval = Math.floor(this.interval());

    if (!task || !this.date() || (unit && !(interval >= 1))) return;
    void this.tasks.reschedule(task.id, this.date(), unit ? { interval, unit } : null);
    this.close();
  }
}
