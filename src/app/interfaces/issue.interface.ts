import type { Schema } from '../../../shared/model';
export type IssueKind = 'FAULT' | 'WARRANTY' | 'RENEWAL' | 'OTHER';
export type IssueView = Schema['Issue'] & { kind: IssueKind };
