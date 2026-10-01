import type { Schema } from '../../../shared/model';

/** Detail-only Thing fields. Relation ID arrays are derived from the child stores instead. */
export type ThingDetail = Pick<
  Schema['Thing'],
  'fieldSets' | 'standaloneFields' | 'undefinedFields' | 'pinnedFields' | 'import'
>;

/** A Thing summary, with its detail once the Thing has been loaded by ID. */
export type ThingRecord = Schema['ThingSummary'] & { detail?: ThingDetail };

export interface RegistryIndex {
  fieldSets: Record<string, Schema['FieldSet']>;
  fields: Record<string, Schema['FieldDefinition']>;
}
