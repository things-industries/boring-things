import type { Schema } from '../../../shared/model';
export type ActivityAction =
  | { kind: 'issues'; id: string; patch: Schema['IssuePatch'] }
  | { kind: 'events'; id: string; patch: Schema['EventPatch'] };
