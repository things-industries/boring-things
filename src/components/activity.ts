import { Component, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { Schema } from '../../shared/model';
export type ActivityAction =
  | { kind: 'issues'; id: string; patch: Schema['IssuePatch'] }
  | { kind: 'events'; id: string; patch: Schema['EventPatch'] };

@Component({
  selector: 'bt-activity',
  imports: [DatePipe, RouterLink],
  template: `
    @for (issue of issues(); track issue.id) {
      <article class="activity-card">
        <div class="card-top">
          <span class="badge warning">{{
            issue.status === 'open' ? 'Needs attention' : 'Resolved'
          }}</span>
          @if (issue.isSample) {
            <span class="sample">Sample</span>
          }
        </div>
        <h3>
          <a [routerLink]="['/things', issue.thingId]">{{ issue.title }}</a>
        </h3>
        <p>{{ issue.description }}</p>
        @if (issue.status === 'open') {
          <button
            class="small quiet"
            [disabled]="busy()"
            (click)="action.emit({ kind: 'issues', id: issue.id, patch: { status: 'resolved' } })"
          >
            Mark resolved ✓
          </button>
        }
      </article>
    }
    @for (event of events(); track event.id) {
      <article class="activity-card">
        <div class="card-top">
          <span class="badge">{{ event.status }}</span>
          @if (event.isSample) {
            <span class="sample">Sample</span>
          }
        </div>
        <h3>
          <a [routerLink]="['/things', event.thingId]">{{ event.title }}</a>
        </h3>
        <p>{{ event.description }}</p>
        @if (event.startsAt) {
          <p class="date">{{ event.startsAt | date: 'medium' }}</p>
        }
        @if (event.status === 'suggested') {
          <label class="compact-label">Schedule for<input type="datetime-local" #dateInput /></label
          ><button
            class="small quiet"
            [disabled]="busy()"
            (click)="schedule(event.id, dateInput.value)"
          >
            Schedule →
          </button>
        }
        @if (event.status === 'scheduled') {
          <button
            class="small quiet"
            [disabled]="busy()"
            (click)="action.emit({ kind: 'events', id: event.id, patch: { status: 'completed' } })"
          >
            Mark complete ✓
          </button>
        }
      </article>
    }
  `,
})
export class Activity {
  issues = input<Schema['Issue'][]>([]);
  events = input<Schema['Event'][]>([]);
  busy = input(false);
  action = output<ActivityAction>();
  schedule(id: string, date: string) {
    if (date && !Number.isNaN(new Date(date).valueOf()))
      this.action.emit({
        kind: 'events',
        id,
        patch: { status: 'scheduled', startsAt: new Date(date).toISOString() },
      });
  }
}
