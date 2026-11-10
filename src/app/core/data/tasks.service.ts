/** HTTP access for Tasks and their lifecycle operations. */

import { Injectable, inject } from '@angular/core';
import type { Schema } from '../../../../shared/model';
import { allPages, apiData } from '../api/api-client';
import { Api } from '../services/api.service';

@Injectable({ providedIn: 'root' })
export class TasksService {
  private client = inject(Api).client;
  list() {
    return allPages((query) => this.client.GET('/api/tasks', { params: { query } }));
  }
  get(id: string) {
    return this.client.GET('/api/tasks/{id}', { params: { path: { id } } }).then(apiData);
  }
  update(id: string, body: Schema['TaskPatch']) {
    return this.client.PATCH('/api/tasks/{id}', { params: { path: { id } }, body }).then(apiData);
  }
  change(id: string, action: 'accept' | 'complete' | 'close') {
    return this.client
      .POST(`/api/tasks/{id}:${action}`, {
        params: { path: { id } },
        body: { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      })
      .then(apiData);
  }
  reopen(id: string) {
    return this.client.POST('/api/tasks/{id}:reopen', { params: { path: { id } } }).then(apiData);
  }
  completeFollowup(id: string, body: Schema['TaskFollowupInput']) {
    return this.client
      .POST('/api/tasks/{id}:followup', { params: { path: { id } }, body })
      .then(apiData);
  }
  async remove(id: string) {
    const result = await this.client.DELETE('/api/tasks/{id}', { params: { path: { id } } });
    if (result.error) throw result.error;
  }
}
