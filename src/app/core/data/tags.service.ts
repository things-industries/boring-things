import { Injectable, inject } from '@angular/core';
import type { Schema } from '../../../../shared/model';
import { allPages, apiData } from '../api/api-client';
import { Api } from '../services/api.service';

@Injectable({ providedIn: 'root' })
export class TagsService {
  private client = inject(Api).client;
  list() {
    return allPages((query) => this.client.GET('/api/tags', { params: { query } }));
  }

  create(body: Schema['TagInput']) {
    return this.client.POST('/api/tags', { body }).then(apiData);
  }

  update(id: string, body: Schema['TagInput']) {
    return this.client.PATCH('/api/tags/{id}', { params: { path: { id } }, body }).then(apiData);
  }

  async remove(id: string) {
    await this.client.DELETE('/api/tags/{id}', { params: { path: { id } } });
  }
}
