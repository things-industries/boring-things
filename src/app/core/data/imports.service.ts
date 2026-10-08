import { Injectable, inject } from '@angular/core';
import { apiData } from '../api/api-client';
import { Api } from '../services/api.service';

@Injectable({ providedIn: 'root' })
export class ImportsService {
  private client = inject(Api).client;
  get(id: string) {
    return this.client.GET('/api/imports/{id}', { params: { path: { id } } }).then(apiData);
  }

  retry(id: string) {
    return this.client.POST('/api/imports/{id}:retry', { params: { path: { id } } }).then(apiData);
  }
}
