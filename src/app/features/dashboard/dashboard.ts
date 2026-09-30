import { DashboardSkeleton } from './dashboard-skeleton';
import { TermPipe } from '../../pipes/term.pipe';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { addThing, open, searchThings } from '../../core/app-icons';
import { apiData } from '../../core/api/api-client';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { Schema } from '../../../../shared/model';
import { Api } from '../../core/services/api.service';
import { CONFIG } from '../../core/runtime-config';
import { APP_CONFIG } from '../../core/app.config';
import { errorCode } from '../../utils/error.util';
import type { UiErrorCode } from '../../interfaces/error.interface';
import { ErrorMessage } from '../../components/error-message/error-message';
import { Activity } from '../../components/activity/activity';
import type { ActivityAction } from '../../interfaces/activity.interface';
@Component({
  viewProviders: [provideIcons({ addThing, open, searchThings })],
  selector: 'bt-dashboard',
  imports: [DashboardSkeleton, FormsModule, RouterLink, Activity, ErrorMessage, NgIcon, TermPipe],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  readonly api = inject(Api);
  readonly config = inject(CONFIG);
  things = signal<Schema['ThingSummary'][]>([]);
  categories = signal<Schema['Category'][]>([]);
  tags = signal<Schema['Tag'][]>([]);
  issues = signal<Schema['Issue'][]>([]);
  events = signal<Schema['Event'][]>([]);
  samplesAdded = signal(false);
  error = signal<UiErrorCode | null>(null);
  busy = signal(false);
  loaded = signal(false);
  cursor = signal<string | null>(null);
  q = '';
  categoryId = '';
  tagId = '';
  private request = 0;
  constructor() {
    void this.load();
  }
  async load() {
    this.error.set(null);
    try {
      const [categories, tags, issues, events, profile] = await Promise.all([
        this.api.all((query) => this.api.client.GET('/api/categories', { params: { query } })),
        this.api.all((query) => this.api.client.GET('/api/tags', { params: { query } })),
        this.api.client
          .GET('/api/issues', {
            params: {
              query: { status: 'OPEN', limit: APP_CONFIG.activityLimit },
            },
          })
          .then(apiData),
        this.api.client
          .GET('/api/events', {
            params: {
              query: {
                status: 'SCHEDULED',
                from: new Date().toISOString(),
                limit: APP_CONFIG.activityLimit,
              },
            },
          })
          .then(apiData),
        this.api.client.GET('/api/profile').then(apiData),
      ]);
      this.categories.set(categories);
      this.tags.set(tags);
      this.issues.set(issues.items);
      this.events.set(events.items);
      this.samplesAdded.set(profile.samplesAdded);
      await this.search();
    } catch (e) {
      this.error.set(errorCode(e));
    } finally {
      this.loaded.set(true);
    }
  }
  async search(more = false) {
    const request = ++this.request;
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.api.client
        .GET('/api/things', {
          params: {
            query: {
              q: this.q,
              limit: APP_CONFIG.thingPageSize,
              categoryId: this.categoryId || undefined,
              tagId: this.tagId || undefined,
              cursor: more ? (this.cursor() ?? undefined) : undefined,
            },
          },
        })
        .then(apiData);
      if (request === this.request) {
        this.things.set(more ? [...this.things(), ...result.items] : result.items);
        this.cursor.set(result.nextCursor);
      }
    } catch (e) {
      this.error.set(errorCode(e));
    } finally {
      if (request === this.request) this.busy.set(false);
    }
  }
  chooseCategory(id: string) {
    this.categoryId = id;
    void this.search();
  }
  category(id: string) {
    return this.categories().find((c) => c.id === id);
  }
  async samples() {
    this.busy.set(true);
    try {
      await this.api.client.POST('/api/profile:seed-samples');
      await this.load();
    } catch (e) {
      this.error.set(errorCode(e));
    } finally {
      this.busy.set(false);
    }
  }
  async activity(action: ActivityAction) {
    this.busy.set(true);
    try {
      if (action.kind === 'issues')
        await this.api.client.PATCH('/api/issues/{id}', {
          params: { path: { id: action.id } },
          body: action.patch,
        });
      else
        await this.api.client.PATCH('/api/events/{id}', {
          params: { path: { id: action.id } },
          body: action.patch,
        });
      await this.load();
    } catch (e) {
      this.error.set(errorCode(e));
    } finally {
      this.busy.set(false);
    }
  }
}
