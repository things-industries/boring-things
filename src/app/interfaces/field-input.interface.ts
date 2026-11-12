import type { Schema } from '../../../shared/model';

export type Currency = Schema['Money']['currency'];

/** The control a field value is edited with. */
export type FieldInputKind =
  'text' | 'textarea' | 'email' | 'number' | 'date' | 'date-time' | 'money' | 'boolean' | 'select';

/** How to edit and validate one value. */
export interface FieldInput {
  kind: FieldInputKind;
  sensitive: boolean;
  required?: boolean;
  integer?: boolean;
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  pattern?: string;
  options?: readonly { value: string; label: string }[];
}

/** An amount being typed, kept as text until saved. */
export interface MoneyDraft {
  amount: string;
  currency: Currency;
}

/** A value as its control holds it: text for every kind except money. */
export type FieldDraft = string | MoneyDraft;
