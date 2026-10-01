// Mock for #9: Issue kind and due-date ordering. Remove when #9 is delivered.
import type { Schema } from '../../../../shared/model';
import type { IssueKind, IssueView } from '../../interfaces/issue.interface';
function kind(issue: Schema['Issue']): IssueKind {
  const text = `${issue.title} ${issue.description}`;
  if (/warrant/i.test(text)) return 'WARRANTY';
  if (/renew|expire|expiry/i.test(text)) return 'RENEWAL';
  if (/fault|broken|leak|repair|error|not working/i.test(text)) return 'FAULT';
  return 'OTHER';
}
/** Adds an inferred kind and orders by due date (undated last), keeping the API order otherwise. */
export function mockIssueKinds(issues: Schema['Issue'][]): IssueView[] {
  return issues
    .map((issue) => ({ ...issue, kind: kind(issue) }))
    .sort((a, b) => {
      if (a.dueDate === b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate < b.dueDate ? -1 : 1;
    });
}
