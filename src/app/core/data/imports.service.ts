import { Injectable, inject } from '@angular/core';
import type { Schema } from '../../../../shared/model';
import { apiData } from '../api/api-client';
import { Api } from '../services/api.service';
import { watchSse } from '../api/thing-stream';

@Injectable({ providedIn: 'root' })
export class ImportsService {
  private client = inject(Api).client;

  create(body: Schema['ImportSubmission']) {
    return this.client.POST('/api/imports', { body }).then(apiData);
  }

  get(id: string) {
    return this.client.GET('/api/imports/{id}', { params: { path: { id } } }).then(apiData);
  }

  retry(id: string) {
    return this.client.POST('/api/imports/{id}:retry', { params: { path: { id } } }).then(apiData);
  }

  watch(
    id: string,
    signal: AbortSignal,
    receive: (value: Schema['Import']) => void,
    failed: () => void,
  ) {
    return watchSse(
      () =>
        this.client.GET('/api/imports/{id}/stream', {
          params: { path: { id } },
          parseAs: 'stream',
          signal,
        }),
      signal,
      (event, data) => {
        if (event === 'import.snapshot') receive(data as Schema['Import']);
      },
      failed,
    );
  }
}
