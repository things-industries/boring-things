import {
  Component,
  Input,
  Output,
  EventEmitter,
  inject,
  signal,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { Schema } from '../../../../shared/model';
import { Api } from '../../core/services/api.service';
import { apiData } from '../../core/api/api-client';
import { ErrorMessage } from '../error-message/error-message';
import { errorCode } from '../../utils/error.util';
import type { UiErrorCode } from '../../interfaces/error.interface';

@Component({
  selector: 'bt-attachment-metadata',
  imports: [FormsModule, DatePipe, ErrorMessage],
  templateUrl: './attachment-metadata.html',
  styleUrl: './attachment-metadata.scss',
})
export class AttachmentMetadata implements OnChanges {
  @Input({ required: true }) file!: Schema['Attachment'];
  @Input() disabled = false;
  @Output() changed = new EventEmitter<Schema['Attachment']>();
  private api = inject(Api);
  editing = signal(false);
  busy = signal(false);
  error = signal<UiErrorCode | null>(null);
  title = '';
  documentType: Schema['AttachmentDocumentTypeEnum'] | '' = '';
  publisher = '';
  documentDate = '';
  private original: Schema['AttachmentPatch'] = {};

  ngOnChanges(changes: SimpleChanges) {
    const file = changes['file'];
    if (file && file.previousValue?.id !== file.currentValue.id) this.cancel();
  }
  edit() {
    this.title = this.file.title ?? '';
    this.documentType = this.file.documentType ?? '';
    this.publisher = this.file.publisher ?? '';
    this.documentDate = this.file.documentDate ?? '';
    this.original = {
      title: this.file.title,
      documentType: this.file.documentType,
      publisher: this.file.publisher,
      documentDate: this.file.documentDate,
    };
    this.error.set(null);
    this.editing.set(true);
  }
  cancel() {
    this.editing.set(false);
    this.error.set(null);
  }
  async save() {
    const id = this.file.id;
    const values: Schema['AttachmentPatch'] = {
      title: this.title.trim() || null,
      documentType: this.documentType || null,
      publisher: this.publisher.trim() || null,
      documentDate: this.documentDate || null,
    };
    const patch: Schema['AttachmentPatch'] = {};
    for (const key of ['title', 'documentType', 'publisher', 'documentDate'] as const)
      if (values[key] !== this.original[key]) Object.assign(patch, { [key]: values[key] });
    if (!Object.keys(patch).length) {
      this.cancel();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const file = await this.api.client
        .PATCH('/api/attachments/{id}', {
          params: { path: { id } },
          body: patch,
        })
        .then(apiData);
      if (this.file.id !== id) return;
      this.changed.emit(file);
      this.cancel();
    } catch (error) {
      if (this.file.id === id) this.error.set(errorCode(error));
    } finally {
      this.busy.set(false);
    }
  }
}
