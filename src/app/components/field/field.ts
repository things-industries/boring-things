import { NgIcon, provideIcons } from '@ng-icons/core';
import { pinField, pinnedField } from '../../core/app-icons';
import { dateTimeInput } from '../../utils/date.util';
import { fieldValue, formatFieldValue, sameValue } from '../../utils/field.util';
import { fieldValueValidator } from '../../validators/field-value.validator';
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
import { ThingsStore } from '../../core/state/things.store';
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
  private things = inject(ThingsStore);
  editing = signal(false);
  revealed = signal(false);
  busy = signal(false);
  error = signal<UiErrorCode | null>(null);
  private secret: Value | null = null;
  draft = '';
  currency: Schema['Money']['currency'] = 'GBP';
  /** Discards edits when the field, its value or the Thing changes; a refreshed copy keeps them. */
  ngOnChanges(changes: SimpleChanges) {
    const previous: Schema['Field'] | undefined = changes['field']?.previousValue;
    const changed =
      !!changes['field'] &&
      (!previous ||
        previous.id !== this.field.id ||
        previous.masked !== this.field.masked ||
        !sameValue(previous.value, this.field.value));

    if (changed || changes['thingId']) this.cancel();
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
    const value = await this.things.reveal(
      this.thingId,
      this.localId
        ? { customFieldId: this.localId }
        : { fieldSetId: this.setId, fieldId: this.field.id },
    );
    this.busy.set(false);
    if (value === undefined) return;
    this.secret = value;
    this.revealed.set(true);
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
