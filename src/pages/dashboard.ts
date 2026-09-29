import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { Schema } from '../../shared/model';
import { Api, CONFIG, errorText } from '../app-services';
import { Activity } from '../components/activity';
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
        this.api.all<Schema['Category']>('/categories'),
        this.api.all<Schema['Tag']>('/tags'),
        this.api.request<Schema['IssueList']>('/issues?status=open&limit=3'),
        this.api.request<Schema['EventList']>(
          '/events?status=scheduled&from=' +
            encodeURIComponent(new Date().toISOString()) +
            '&limit=3',
        ),
        this.api.request<Schema['Profile']>('/profile'),
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
      const query = new URLSearchParams({ q: this.q, limit: '24' });
      if (this.categoryId) query.set('categoryId', this.categoryId);
      if (this.tagId) query.set('tagId', this.tagId);
      if (more && this.cursor()) query.set('cursor', this.cursor()!);
      const result = await this.api.request<Schema['ThingSummaryList']>('/things?' + query);
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
      await this.api.request('/profile:seed-samples', 'POST');
      await this.load();
    } catch (e) {
      this.error.set(errorText(e));
    } finally {
      this.busy.set(false);
    }
  }
  async activity(action: { kind: string; id: string; patch: Record<string, unknown> }) {
    this.busy.set(true);
    try {
      await this.api.request(`/${action.kind}/${action.id}`, 'PATCH', action.patch);
      await this.load();
    } catch (e) {
      this.error.set(errorText(e));
    } finally {
      this.busy.set(false);
    }
  }
}
