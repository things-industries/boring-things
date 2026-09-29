import { NgIcon, provideIcons } from '@ng-icons/core';
import { pinField, pinnedField } from '../../core/app-icons';
import { dateTimeInput } from '../../utils/date.util';
import { fieldValue, formatFieldValue } from '../../utils/field.util';
import { fieldValueValidator } from '../../validators/field-value.validator';
import { apiData } from '../../core/api/api-client';
import {
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
  OnChanges,
  SimpleChanges,
  signal,
} from '@angular/core';
import { FormControl, FormsModule } from '@angular/forms';
import type { Schema, Value } from '../../../../shared/model';
import { Api } from '../../core/services/api.service';
import { errorCode } from '../../utils/error.util';
import type { UiErrorCode } from '../../interfaces/error.interface';
import { ErrorMessage } from '../error-message/error-message';
@Component({
  viewProviders: [provideIcons({ pinField, pinnedField })],
  selector: 'bt-field',
  imports: [FormsModule, ErrorMessage, NgIcon],
  templateUrl: './field.html',
  styleUrl: './field.scss',
})
export class FieldEditor implements OnChanges {
  @Input({ required: true }) field!: Schema['Field'];
  @Input({ required: true }) thingId = '';
  @Input() setId: string | null = null;
  @Input() localId?: string;
  @Input() pinned = false;
  @Input() disabled = false;
  @Output() valueChange = new EventEmitter<Value | null>();
  @Output() pin = new EventEmitter<void>();
  private api = inject(Api);
  editing = signal(false);
  revealed = signal(false);
  busy = signal(false);
  error = signal<UiErrorCode | null>(null);
  private secret: Value | null = null;
  draft = '';
  currency: Schema['Money']['currency'] = 'GBP';
  ngOnChanges(changes: SimpleChanges) {
    if (changes['field'] || changes['thingId']) this.cancel();
  }
  visibleValue() {
    return this.revealed() ? this.secret : this.field.value;
  }
  formattedValue() {
    return formatFieldValue(this.visibleValue());
  }
  async toggleReveal() {
    if (this.revealed()) {
      this.secret = null;
      this.revealed.set(false);
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const result = await this.api.client
        .POST('/api/things/{id}:reveal-field', {
          params: { path: { id: this.thingId } },
          body: this.localId
            ? { undefinedFieldId: this.localId }
            : { fieldSetId: this.setId, fieldId: this.field.id },
        })
        .then(apiData);
      this.secret = result.value;
      this.revealed.set(true);
    } catch (e) {
      this.error.set(errorCode(e));
    } finally {
      this.busy.set(false);
    }
  }
  edit() {
    this.error.set(null);
    const value = this.revealed() ? this.secret : this.field.value;
    this.currency = value && typeof value === 'object' ? value.currency : 'GBP';
    this.draft =
      value === null
        ? ''
        : typeof value === 'object'
          ? (value.amountMinor / 100).toFixed(2)
          : this.field.schema.format === 'date-time'
            ? dateTimeInput(String(value))
            : String(value);
    this.editing.set(true);
  }
  inputType() {
    return this.field.sensitive
      ? 'password'
      : this.field.schema.format === 'date'
        ? 'date'
        : this.field.schema.format === 'date-time'
          ? 'datetime-local'
          : this.field.schema.type === 'number' || this.field.schema.type === 'integer'
            ? 'number'
            : 'text';
  }
  save() {
    const errors = fieldValueValidator(this.field)(new FormControl(this.draft));
    if (errors) {
      this.error.set(Object.keys(errors)[0] as UiErrorCode);
      return;
    }
    this.valueChange.emit(fieldValue(this.field, this.draft, this.currency));
    this.cancel();
  }
  cancel() {
    this.editing.set(false);
    this.revealed.set(false);
    this.secret = null;
    this.draft = '';
    this.error.set(null);
  }
}
