import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { Schema } from '../../../../shared/model';
import { EventsStore } from '../../core/state/events.store';
import { localDateTimeToUtc } from '../../utils/date.util';
import { Dialog } from '../dialog/dialog';

let nextId = 0;

/** Schedules a suggested Event on a date with an optional time. Open while `event` is set. */
@Component({
  selector: 'bt-schedule-dialog',
  imports: [FormsModule, Dialog],
  templateUrl: './schedule-dialog.html',
  styleUrl: './schedule-dialog.scss',
})
export class ScheduleDialog {
  private events = inject(EventsStore);
  readonly event = input<Schema['Event'] | null>(null);
  readonly closed = output<void>();
  readonly date = signal('');
  readonly time = signal('');
  readonly formId = `schedule-event-${nextId++}`;

  close() {
    this.date.set('');
    this.time.set('');
    this.closed.emit();
  }

  schedule() {
    const event = this.event();
    const date = this.date();

    if (!event || !date) return;

    const startsAt = this.time() ? localDateTimeToUtc(`${date}T${this.time()}`) : null;

    void this.events.schedule(
      event.id,
      startsAt ? { startsAt, startsOn: null } : { startsOn: date, startsAt: null },
    );
    this.close();
  }
}
