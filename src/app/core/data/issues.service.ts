import { Injectable, inject } from '@angular/core';
import type { Schema } from '../../../../shared/model';
import { allPages, apiData } from '../api/api-client';
import { Api } from '../services/api.service';

@Injectable({ providedIn: 'root' })
export class IssuesService {
  private client = inject(Api).client;
  list() {
    return allPages((query) => this.client.GET('/api/issues', { params: { query } }));
  }

  get(id: string) {
    return this.client.GET('/api/issues/{id}', { params: { path: { id } } }).then(apiData);
  }

  create(body: Schema['IssueInput']) {
    return this.client.POST('/api/issues', { body }).then(apiData);
  }

  update(id: string, body: Schema['IssuePatch']) {
    return this.client.PATCH('/api/issues/{id}', { params: { path: { id } }, body }).then(apiData);
  }
}
