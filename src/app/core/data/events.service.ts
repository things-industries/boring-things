import { Injectable, inject } from '@angular/core';
import type { Schema } from '../../../../shared/model';
import { allPages, apiData } from '../api/api-client';
import { MockSampleEvents } from '../mocks/sample-tasks.mock';
import { Api } from '../services/api.service';

@Injectable({ providedIn: 'root' })
export class EventsService {
  private client = inject(Api).client;
  private samples = inject(MockSampleEvents);
  list(timeZone: string) {
    return allPages((query) =>
      this.client.GET('/api/events', { params: { query: { ...query, timeZone } } }),
    ).then((events) => this.samples.withSamples(events));
  }

  get(id: string) {
    const sample = this.samples.get(id);

    if (sample) return Promise.resolve(sample);
    return this.client.GET('/api/events/{id}', { params: { path: { id } } }).then(apiData);
  }

  create(body: Schema['EventInput']) {
    const sample = this.samples.create(body);

    if (sample) return Promise.resolve(sample);
    return this.client.POST('/api/events', { body }).then(apiData);
  }

  update(id: string, body: Schema['EventPatch']) {
    const sample = this.samples.update(id, body);

    if (sample) return Promise.resolve(sample);
    return this.client.PATCH('/api/events/{id}', { params: { path: { id } }, body }).then(apiData);
  }
}
