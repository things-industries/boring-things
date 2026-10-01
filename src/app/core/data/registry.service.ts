import { Injectable, inject } from '@angular/core';
import { allPages } from '../api/api-client';
import { Api } from '../services/api.service';

@Injectable({ providedIn: 'root' })
export class RegistryService {
  private client = inject(Api).client;
  fieldSets() {
    return allPages((query) => this.client.GET('/api/field-sets', { params: { query } }));
  }

  fields() {
    return allPages((query) => this.client.GET('/api/fields', { params: { query } }));
  }
}
