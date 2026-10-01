import { Injectable, inject } from '@angular/core';
import { allPages } from '../api/api-client';
import { Api } from '../services/api.service';

@Injectable({ providedIn: 'root' })
export class CategoriesService {
  private client = inject(Api).client;
  list() {
    return allPages((query) => this.client.GET('/api/categories', { params: { query } }));
  }
}
