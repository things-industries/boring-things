import type { IconBadgeTone } from '../interfaces/icon-badge.interface';
import type { IssueKind } from '../interfaces/issue.interface';

export const issueBadges: Record<IssueKind, { icon: string; tone: IconBadgeTone }> = {
  RENEWAL: { icon: 'issueRenewal', tone: 'info' },
  WARRANTY: { icon: 'issueWarranty', tone: 'accent' },
  FAULT: { icon: 'issueFault', tone: 'warning' },
  OTHER: { icon: 'issueOther', tone: 'neutral' },
};
