/** Followup answers that update Thing fields or add attachments. */

import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AttachmentsStore } from '../../core/state/attachments.store';
import { ThingDatesStore } from '../../core/state/thing-dates.store';
import { ThingsStore } from '../../core/state/things.store';
import { Dialog } from '../dialog/dialog';
import type { CompletionAction } from '../../interfaces/task.interface';
import { amountMinor, fieldValue } from '../../utils/field.util';
import type { Value } from '../../../../shared/model';

/** A field or document completion action waiting for an answer. */
export interface FollowUpRequest {
  thingId: string;
  action: Extract<CompletionAction, { type: 'UPDATE_FIELD' | 'ADD_ATTACHMENT' }>;
}

let nextId = 0;

/**
 * Answers a completion action: updates the Thing field it names, or uploads a document to the Thing. Open
 * while `request` is set.
 */
@Component({
  selector: 'bt-follow-up-dialog',
  imports: [FormsModule, Dialog],
  templateUrl: './follow-up-dialog.html',
  styleUrl: './follow-up-dialog.scss',
})
export class FollowUpDialog {
  private dates = inject(ThingDatesStore);
  private things = inject(ThingsStore);
  private attachments = inject(AttachmentsStore);
  readonly request = input<FollowUpRequest | null>(null);
  readonly closed = output<void>();
  readonly draft = signal('');
  readonly file = signal<File | null>(null);
  readonly busy = signal(false);
  readonly formId = `follow-up-${nextId++}`;

  /** The field an `UPDATE_FIELD` action names, with its set; `null` once it is missing. */
  readonly target = computed(() => {
    const request = this.request();

    if (request?.action.type !== 'UPDATE_FIELD') return null;

    const { fieldId, fieldSetId, customFieldId } = request.action;
    const detail = this.things.entityMap()[request.thingId]?.detail;
    const set = detail?.fieldSets.find((s) => s.id === fieldSetId);
    const field = set
      ? set.fields.find((f) => f.id === fieldId)
      : detail?.standaloneFields.find((f) => f.id === fieldId);

    const custom = customFieldId ? detail?.customFields.find((f) => f.id === customFieldId) : null;
    return custom
      ? { custom, field: null, setId: null }
      : field
        ? { custom: null, field, setId: set?.id ?? null }
        : null;
  });

  readonly ready = computed(() => {
    if (this.request()?.action.type === 'ADD_ATTACHMENT') return !!this.file();
    const draft = this.draft().trim();
    if (!draft) return false;
    switch (this.target()?.custom?.valueType) {
      case 'NUMBER':
        return Number.isFinite(Number(draft));
      case 'BOOLEAN':
        return draft === 'true' || draft === 'false';
      case 'MONEY':
        return /^\d+(\.\d{1,2})?$/.test(draft) && Number.isSafeInteger(amountMinor(draft));
      default:
        return true;
    }
  });

  close() {
    this.draft.set('');
    this.file.set(null);
    this.closed.emit();
  }

  chooseFile(event: Event) {
    this.file.set((event.target as HTMLInputElement).files?.[0] ?? null);
  }

  /** Saves the answer using the target field's type and existing money currency. */
  async save() {
    const request = this.request();
    const target = this.target();
    const file = this.file();

    if (!request || !this.ready() || this.busy()) return;
    if (request.action.type === 'UPDATE_FIELD') {
      if (!target) return;
      let value: Value = this.draft().trim();
      if (target.custom?.valueType === 'NUMBER') value = Number(value);
      if (target.custom?.valueType === 'BOOLEAN') value = value === 'true';
      this.busy.set(true);
      if (target.custom?.valueType === 'MONEY') {
        const previous = target.custom.masked
          ? await this.things.reveal(request.thingId, { customFieldId: target.custom.id })
          : target.custom.value;
        if (previous === undefined) {
          this.busy.set(false);
          return;
        }
        value = {
          amountMinor: amountMinor(this.draft().trim()),
          currency: previous && typeof previous === 'object' ? previous.currency : 'GBP',
        };
      }
      const result = await this.things.update(
        request.thingId,
        target.custom
          ? {
              customFields: [
                {
                  id: target.custom.id,
                  label: target.custom.label,
                  value,
                  sensitive: target.custom.sensitive,
                },
              ],
            }
          : {
              values: [
                {
                  fieldSetId: target.setId,
                  fieldId: target.field.id,
                  value: fieldValue(target.field, this.draft().trim(), 'GBP'),
                },
              ],
            },
      );
      this.busy.set(false);
      if (result.ok) {
        await this.dates.reload();
        this.close();
      }
      return;
    }

    if (!file) return;
    this.busy.set(true);

    const result = await this.attachments.upload(file, request.thingId);

    this.busy.set(false);
    if (result.ok) {
      if (request.action.type === 'ADD_ATTACHMENT' && request.action.documentType) {
        const changed = await this.attachments.update(result.value.id, {
          documentType: request.action.documentType,
        });
        if (!changed.ok) return;
      }
      this.close();
    }
  }
}
