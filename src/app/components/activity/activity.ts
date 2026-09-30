import { NgIcon, provideIcons } from '@ng-icons/core';
import { complete, scheduleEvent } from '../../core/app-icons';
import { Component, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { Schema } from '../../../../shared/model';
import type { ActivityAction } from '../../interfaces/activity.interface';
import { daysUntil, localDateTimeToUtc } from '../../utils/date.util';

@Component({
  viewProviders: [provideIcons({ scheduleEvent, complete })],
  selector: 'bt-activity',
  imports: [DatePipe, RouterLink, NgIcon],
  templateUrl: './activity.html',
  styleUrl: './activity.scss',
})
export class Activity {
  issues = input<Schema['Issue'][]>([]);
  events = input<Schema['Event'][]>([]);
  busy = input(false);
  action = output<ActivityAction>();
  readonly daysUntil = daysUntil;
  schedule(id: string, date: string, dateOnly = false) {
    const startsAt = dateOnly ? null : localDateTimeToUtc(date);
    const startsOn = dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
    if (startsAt || startsOn)
      this.action.emit({
        kind: 'events',
        id,
        patch: { status: 'SCHEDULED', startsAt, startsOn },
      });
  }
}
