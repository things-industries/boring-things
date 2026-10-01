import { Injectable, inject } from '@angular/core';
import type { Schema } from '../../../../shared/model';
import { allPages, apiData } from '../api/api-client';
import { Api } from '../services/api.service';

@Injectable({ providedIn: 'root' })
export class EventsService {
  private client = inject(Api).client;
  list(timeZone: string) {
    return allPages((query) =>
      this.client.GET('/api/events', { params: { query: { ...query, timeZone } } }),
    );
  }

  get(id: string) {
    return this.client.GET('/api/events/{id}', { params: { path: { id } } }).then(apiData);
  }

  create(body: Schema['EventInput']) {
    return this.client.POST('/api/events', { body }).then(apiData);
  }

  update(id: string, body: Schema['EventPatch']) {
    return this.client.PATCH('/api/events/{id}', { params: { path: { id } }, body }).then(apiData);
  }
}
