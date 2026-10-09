import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AttachmentsStore } from '../../core/state/attachments.store';
import { ThingsStore } from '../../core/state/things.store';
import { Dialog } from '../dialog/dialog';
import type { FollowUp } from '../../interfaces/task.interface';
import { fieldValue } from '../../utils/field.util';

/** A field or document follow-up waiting for an answer. */
export interface FollowUpRequest {
  thingId: string;
  followUp: Extract<FollowUp, { type: 'UPDATE_FIELD' | 'ADD_DOCUMENT' }>;
}

let nextId = 0;

/**
 * Answers a follow-up: updates the Thing field it names, or uploads a document to the Thing. Open
 * while `request` is set.
 */
@Component({
  selector: 'bt-follow-up-dialog',
  imports: [FormsModule, Dialog],
  templateUrl: './follow-up-dialog.html',
  styleUrl: './follow-up-dialog.scss',
})
export class FollowUpDialog {
  private things = inject(ThingsStore);
  private attachments = inject(AttachmentsStore);
  readonly request = input<FollowUpRequest | null>(null);
  readonly closed = output<void>();
  readonly draft = signal('');
  readonly file = signal<File | null>(null);
  readonly busy = signal(false);
  readonly formId = `follow-up-${nextId++}`;

  /** The field an `UPDATE_FIELD` follow-up names, with its set; `null` once it is missing. */
  readonly target = computed(() => {
    const request = this.request();

    if (request?.followUp.type !== 'UPDATE_FIELD') return null;

    const { fieldId } = request.followUp;
    const detail = this.things.entityMap()[request.thingId]?.detail;
    const set = detail?.fieldSets.find((s) => s.fields.some((f) => f.id === fieldId));
    const field = set
      ? set.fields.find((f) => f.id === fieldId)
      : detail?.standaloneFields.find((f) => f.id === fieldId);

    return field ? { field, setId: set?.id ?? null } : null;
  });

  readonly ready = computed(() =>
    this.request()?.followUp.type === 'ADD_DOCUMENT' ? !!this.file() : !!this.draft().trim(),
  );

  close() {
    this.draft.set('');
    this.file.set(null);
    this.closed.emit();
  }

  chooseFile(event: Event) {
    this.file.set((event.target as HTMLInputElement).files?.[0] ?? null);
  }

  async save() {
    const request = this.request();
    const target = this.target();
    const file = this.file();

    if (!request || !this.ready() || this.busy()) return;
    if (request.followUp.type === 'UPDATE_FIELD') {
      if (!target) return;
      void this.things.update(request.thingId, {
        values: [
          {
            fieldSetId: target.setId,
            fieldId: target.field.id,
            value: fieldValue(target.field, this.draft().trim(), 'GBP'),
          },
        ],
      });
      this.close();
      return;
    }

    if (!file) return;
    this.busy.set(true);

    const result = await this.attachments.upload(file, request.thingId);

    this.busy.set(false);
    if (result.ok) this.close();
  }
}
