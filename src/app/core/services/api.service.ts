import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { Schema } from '../../../../shared/model';
import { Auth } from './auth.service';
import { APP_CONFIG } from '../app.config';
import { allPages, apiData, createApiClient } from '../api/api-client';
@Injectable({ providedIn: 'root' })
export class Api {
  private auth = inject(Auth);
  private router = inject(Router);
  readonly client = createApiClient({
    token: () => this.auth.token(),
    onUnauthorized: () => {
      this.auth.expireSession();
      void this.router.navigate(['/login']);
    },
  });
  readonly all = allPages;
  async blob(id: string) {
    return this.client
      .GET('/api/attachments/{id}/content', {
        params: { path: { id } },
        parseAs: 'blob',
      })
      .then(apiData);
  }
  async download(file: Schema['Attachment']) {
    const url = URL.createObjectURL(await this.blob(file.id));
    const link = document.createElement('a');
    link.href = url;
    link.download = file.filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), APP_CONFIG.downloadUrlLifetimeMs);
  }
}
