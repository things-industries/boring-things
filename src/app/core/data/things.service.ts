import { Injectable, inject } from '@angular/core';
import type { Schema } from '../../../../shared/model';
import { allPages, apiData } from '../api/api-client';
import { watchThing } from '../api/thing-stream';
import { Api } from '../services/api.service';

@Injectable({ providedIn: 'root' })
export class ThingsService {
  private client = inject(Api).client;
  list() {
    return allPages((query) => this.client.GET('/api/things', { params: { query } }));
  }

  get(id: string) {
    return this.client.GET('/api/things/{id}', { params: { path: { id } } }).then(apiData);
  }

  create(body: Schema['ThingCreate']) {
    return this.client.POST('/api/things', { body }).then(apiData);
  }

  update(id: string, body: Schema['ThingPatch']) {
    return this.client.PATCH('/api/things/{id}', { params: { path: { id } }, body }).then(apiData);
  }

  async remove(id: string) {
    await this.client.DELETE('/api/things/{id}', { params: { path: { id } } });
  }

  view(id: string) {
    return this.client.POST('/api/things/{id}:view', { params: { path: { id } } }).then(apiData);
  }

  reveal(id: string, body: Schema['RevealRequest']) {
    return this.client
      .POST('/api/things/{id}:reveal-field', { params: { path: { id } }, body })
      .then(apiData);
  }

  watch(
    id: string,
    signal: AbortSignal,
    receive: (thing: Schema['Thing']) => void,
    failed: () => void,
  ) {
    return watchThing(this.client, id, signal, receive, failed);
  }
}
