import { Injectable, inject } from '@angular/core';
import { allPages, apiData } from '../api/api-client';
import { Api } from '../services/api.service';

@Injectable({ providedIn: 'root' })
export class PurchasablesService {
  private client = inject(Api).client;
  list(thingId: string) {
    return allPages((query) =>
      this.client.GET('/api/purchasables', { params: { query: { ...query, thingId } } }),
    );
  }

  get(id: string) {
    return this.client.GET('/api/purchasables/{id}', { params: { path: { id } } }).then(apiData);
  }
}
