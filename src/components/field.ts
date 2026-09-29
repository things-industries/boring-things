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
import { FormsModule } from '@angular/forms';
import type { Schema, Value } from '../../shared/model';
import { Api, errorText } from '../app-services';
@Component({
  selector: 'bt-field',
  imports: [FormsModule],
  template: `
    <div class="field-row">
      <div class="field-label">
        <span>{{ field.name }}</span>
        @if (field.sensitive) {
          <span class="sensitive-note">Sensitive</span>
        }
      </div>
      @if (!editing()) {
        <div class="field-display">
          <span [class.placeholder]="field.value === null && !field.masked && !revealed()">{{
            display()
          }}</span>
          <div class="field-actions">
            @if (field.masked) {
              <button class="quiet small" [disabled]="busy() || disabled" (click)="toggleReveal()">
                {{ revealed() ? 'Hide' : 'Reveal' }}
              </button>
            }
            <button class="quiet small" [disabled]="disabled" (click)="edit()">
              {{ field.value === null && !field.masked ? 'Add' : 'Edit' }}</button
            ><button
              class="quiet small"
              [attr.aria-label]="(pinned ? 'Unpin ' : 'Pin ') + field.name"
              [disabled]="disabled"
              (click)="pin.emit()"
            >
              {{ pinned ? '★' : '☆' }}
            </button>
          </div>
        </div>
      } @else {
        <form class="field-edit" (ngSubmit)="save()">
          @if (field.uiHint === 'money') {
            <div class="money-input">
              <select name="currency" [(ngModel)]="currency" aria-label="Currency">
                <option>GBP</option>
                <option>EUR</option>
                <option>USD</option></select
              ><input
                name="value"
                [(ngModel)]="draft"
                inputmode="decimal"
                [attr.aria-label]="field.name"
                placeholder="0.00"
              />
            </div>
          } @else if (field.schema.type === 'boolean') {
            <select name="value" [(ngModel)]="draft" [attr.aria-label]="field.name">
              <option value="">Choose…</option>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          } @else if (field.schema.enum) {
            <select name="value" [(ngModel)]="draft" [attr.aria-label]="field.name">
              <option value="">Choose…</option>
              @for (option of field.schema.enum; track option) {
                <option [value]="option">{{ option }}</option>
              }
            </select>
          } @else {
            <input
              name="value"
              [(ngModel)]="draft"
              [type]="inputType()"
              [attr.aria-label]="field.name"
              autocomplete="off"
              [attr.maxlength]="field.schema.maxLength ?? null"
            />
          }
          <div class="field-actions">
            <button class="small" type="submit" [disabled]="busy() || disabled">Save</button
            ><button class="quiet small" type="button" (click)="cancel()">Cancel</button>
            @if (field.value !== null || field.masked) {
              <button
                class="quiet small"
                type="button"
                [disabled]="disabled"
                (click)="valueChange.emit(null); cancel()"
              >
                Clear
              </button>
            }
          </div>
        </form>
      }
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
    </div>
  `,
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
  error = signal('');
  private secret: Value | null = null;
  draft = '';
  currency: Schema['Money']['currency'] = 'GBP';
  ngOnChanges(changes: SimpleChanges) {
    if (changes['field'] || changes['thingId']) this.cancel();
  }
  display() {
    const value = this.revealed() ? this.secret : this.field.value;
    if (this.field.masked && !this.revealed()) return '••••••••';
    if (value === null) return 'Add a value';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object')
      return new Intl.NumberFormat('en-GB', { style: 'currency', currency: value.currency }).format(
        value.amountMinor / 100,
      );
    return value === '' ? 'Empty text' : String(value);
  }
  async toggleReveal() {
    if (this.revealed()) {
      this.secret = null;
      this.revealed.set(false);
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const result = await this.api.request<Schema['RevealResult']>(
        `/things/${this.thingId}:reveal-field`,
        'POST',
        this.localId
          ? { undefinedFieldId: this.localId }
          : { fieldSetId: this.setId, fieldId: this.field.id },
      );
      this.secret = result.value;
      this.revealed.set(true);
    } catch (e) {
      this.error.set(errorText(e));
    } finally {
      this.busy.set(false);
    }
  }
  edit() {
    this.error.set('');
    const value = this.revealed() ? this.secret : this.field.value;
    this.currency = value && typeof value === 'object' ? value.currency : 'GBP';
    this.draft =
      value === null
        ? ''
        : typeof value === 'object'
          ? (value.amountMinor / 100).toFixed(2)
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
    try {
      let value: Value = this.draft;
      if (this.field.schema.type === 'boolean') {
        if (!['true', 'false'].includes(this.draft)) throw new Error('Choose Yes or No');
        value = this.draft === 'true';
      } else if (this.field.uiHint === 'money') {
        if (!/^\d+(\.\d{1,2})?$/.test(this.draft))
          throw new Error('Use an amount with up to two decimal places');
        const [whole, fraction = ''] = this.draft.split('.');
        const amountMinor = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
        if (!Number.isSafeInteger(amountMinor)) throw new Error('Amount is too large');
        value = { amountMinor, currency: this.currency };
      } else if (this.field.schema.type === 'integer' || this.field.schema.type === 'number') {
        if (!this.draft.trim() || !Number.isFinite(Number(this.draft)))
          throw new Error('Enter a number');
        value = Number(this.draft);
      } else if (this.field.schema.format === 'date-time') {
        value = new Date(this.draft).toISOString();
      }
      this.valueChange.emit(value);
      this.cancel();
    } catch (e) {
      this.error.set(errorText(e));
    }
  }
  cancel() {
    this.editing.set(false);
    this.revealed.set(false);
    this.secret = null;
    this.draft = '';
    this.error.set('');
  }
}
