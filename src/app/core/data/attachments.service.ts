import { Injectable, inject } from '@angular/core';
import type { Schema } from '../../../../shared/model';
import { allPages, apiData } from '../api/api-client';
import { APP_CONFIG } from '../app.config';
import { Api } from '../services/api.service';

@Injectable({ providedIn: 'root' })
export class AttachmentsService {
  private client = inject(Api).client;
  list() {
    return allPages((query) => this.client.GET('/api/attachments', { params: { query } }));
  }

  get(id: string) {
    return this.client.GET('/api/attachments/{id}', { params: { path: { id } } }).then(apiData);
  }

  upload(file: File) {
    return this.client
      .POST('/api/attachments', {
        body: { file },

        bodySerializer(body) {
          const form = new FormData();

          form.append('file', body.file);
          return form;
        },
      })
      .then(apiData);
  }

  update(id: string, body: Schema['AttachmentPatch']) {
    return this.client
      .PATCH('/api/attachments/{id}', { params: { path: { id } }, body })
      .then(apiData);
  }

  async remove(id: string) {
    await this.client.DELETE('/api/attachments/{id}', { params: { path: { id } } });
  }

  async link(id: string, thingId: string) {
    await this.client.PUT('/api/attachments/{id}/things/{thingId}', {
      params: { path: { id, thingId } },
    });
  }

  async unlink(id: string, thingId: string) {
    await this.client.DELETE('/api/attachments/{id}/things/{thingId}', {
      params: { path: { id, thingId } },
    });
  }

  blob(id: string) {
    return this.client
      .GET('/api/attachments/{id}/content', { params: { path: { id } }, parseAs: 'blob' })
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
