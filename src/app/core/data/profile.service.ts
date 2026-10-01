import { Injectable, inject } from '@angular/core';
import { apiData } from '../api/api-client';
import { Api } from '../services/api.service';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private client = inject(Api).client;
  get() {
    return this.client.GET('/api/profile').then(apiData);
  }

  seedSamples() {
    return this.client.POST('/api/profile:seed-samples').then(apiData);
  }
}
