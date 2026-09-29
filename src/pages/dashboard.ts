import { apiData } from '../core/api/api-client';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { Schema } from '../../shared/model';
import { Api, CONFIG, errorText } from '../app-services';
import { Activity, type ActivityAction } from '../components/activity';
@Component({
  selector: 'bt-dashboard',
  imports: [FormsModule, RouterLink, Activity],
  templateUrl: './dashboard.html',
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
  error = signal('');
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
    this.error.set('');
    try {
      const [categories, tags, issues, events, profile] = await Promise.all([
        this.api.all((query) => this.api.client.GET('/api/categories', { params: { query } })),
        this.api.all((query) => this.api.client.GET('/api/tags', { params: { query } })),
        this.api.client
          .GET('/api/issues', {
            params: { query: { status: 'open', limit: 3 } },
          })
          .then(apiData),
        this.api.client
          .GET('/api/events', {
            params: { query: { status: 'scheduled', from: new Date().toISOString(), limit: 3 } },
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
      this.error.set(errorText(e));
    } finally {
      this.loaded.set(true);
    }
  }
  async search(more = false) {
    const request = ++this.request;
    this.busy.set(true);
    this.error.set('');
    try {
      const result = await this.api.client
        .GET('/api/things', {
          params: {
            query: {
              q: this.q,
              limit: 24,
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
      this.error.set(errorText(e));
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
      this.error.set(errorText(e));
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
      this.error.set(errorText(e));
    } finally {
      this.busy.set(false);
    }
  }
}
