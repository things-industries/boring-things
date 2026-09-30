import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { Schema } from '../../../../shared/model';
import { Api } from '../../core/services/api.service';
import { CONFIG } from '../../core/runtime-config';
import { apiData } from '../../core/api/api-client';
import { errorCode, UiError } from '../../utils/error.util';
import type { UiErrorCode } from '../../interfaces/error.interface';
import { ErrorMessage } from '../../components/error-message/error-message';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { takePhoto, choosePhoto, uploadFile } from '../../core/app-icons';
@Component({
  selector: 'bt-import-panel',
  imports: [FormsModule, RouterLink, ErrorMessage, NgIcon],
  viewProviders: [provideIcons({ takePhoto, choosePhoto, uploadFile })],
  templateUrl: './import-panel.html',
  styleUrl: './import-panel.scss',
})
export class ImportPanel {
  readonly api = inject(Api);
  readonly config = inject(CONFIG);
  private router = inject(Router);
  thingId = input('');
  job = input<Schema['Import'] | null>(null);
  changed = output<Schema['Import']>();
  busy = signal(false);
  error = signal<UiErrorCode | null>(null);
  existing = signal<Schema['ThingSummary'][]>([]);
  selections: Record<string, string> = {};
  text = '';
  active() {
    return (
      !!this.job() &&
      ['QUEUED', 'EXTRACTING', 'MAPPING', 'DISCOVERING', 'AWAITING_SELECTION'].includes(
        this.job()!.status,
      )
    );
  }
  async perform(fn: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await fn();
    } catch (e) {
      this.error.set(errorCode(e));
    } finally {
      this.busy.set(false);
    }
  }
  async file(event: Event) {
    const input = event.target as HTMLInputElement,
      file = input.files?.[0];
    if (file) await this.start(file);
    input.value = '';
  }
  paste() {
    if (this.text.trim())
      void this.start(new File([this.text], 'pasted-text.txt', { type: 'text/plain' }));
  }
  async start(file: File) {
    await this.perform(async () => {
      if (file.size > this.config.maxUploadBytes) throw new UiError('too-large');
      const attachment = await this.api.client
        .POST('/api/attachments', {
          body: { file },
          bodySerializer(body) {
            const form = new FormData();
            form.append('file', body.file);
            return form;
          },
        })
        .then(apiData);
      const accepted = await this.api.client
        .POST('/api/things:import', {
          body: {
            attachmentId: attachment.id,
            ...(this.thingId() ? { thingId: this.thingId() } : {}),
          },
        })
        .then(apiData);
      this.text = '';
      if (accepted.thingId !== this.thingId())
        await this.router.navigate(['/things', accepted.thingId]);
      else
        this.changed.emit(
          await this.api.client
            .GET('/api/imports/{id}', {
              params: { path: { id: accepted.importId } },
            })
            .then(apiData),
        );
    });
  }
  loadExisting() {
    void this.perform(async () => {
      this.existing.set(
        await this.api.all((query) => this.api.client.GET('/api/things', { params: { query } })),
      );
    });
  }
  confirm() {
    const job = this.job();
    if (!job) return;
    void this.perform(async () => {
      const selections = job.candidates
        .filter((c) => this.selections[c.id] !== 'skip')
        .map((c) => ({
          candidateId: c.id,
          targetThingId: this.selections[c.id] || null,
        }));
      const result = await this.api.client
        .POST('/api/imports/{id}:confirm', {
          params: { path: { id: job.id } },
          body: { selections },
        })
        .then(apiData);
      this.changed.emit(result);
      if (result.thingId && result.thingId !== this.thingId())
        await this.router.navigate(['/things', result.thingId]);
    });
  }
  retry() {
    const job = this.job();
    if (!job) return;
    void this.perform(async () => {
      this.changed.emit(
        await this.api.client
          .POST('/api/imports/{id}:retry', { params: { path: { id: job.id } } })
          .then(apiData),
      );
    });
  }
}
