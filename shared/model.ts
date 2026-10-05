import type { components } from './api.js';
export type Schema = components['schemas'];
export type Value = Schema['Value'];
export type Pin = Schema['Pin'];
export type FieldDefinition = Schema['FieldDefinition'];
export type FieldSet = Schema['FieldSet'];
export type Thing = Schema['Thing'];
export type ThingPatch = Schema['ThingPatch'];
export type SourceRef = Schema['SourceRef'];
export interface StoredValue {
  value: Value;
  origin: Schema['FieldOriginEnum'];
  sourceRefs: SourceRef[];
}
export interface LocalField extends StoredValue {
  id: string;
  label: string;
  sensitive: boolean;
  instanceSpecific?: boolean;
}
export interface ThingData {
  userEdited?: string[];
  setIds: string[];
  values: Record<string, Record<string, StoredValue>>;
  standalone: Record<string, StoredValue>;
  undefinedFields: LocalField[];
  pins: Pin[];
}
export const emptyData = (): ThingData => ({
  setIds: [],
  values: {},
  standalone: {},
  undefinedFields: [],
  pins: [],
});
