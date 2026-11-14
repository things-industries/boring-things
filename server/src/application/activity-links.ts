/** User-scoped Issue links for Tasks and Events. */

import type { Database } from '../db/connection.js';
import * as activityDb from '../db/entities/activity.js';
import { ensure } from './errors.js';

/** Checks that a linked Issue belongs to this Thing and is open for active work. */
export async function validateIssueLink(
  db: Database,
  userId: string,
  thingId: string,
  issueId: string | null,
  closed: boolean,
) {
  if (!issueId) return;
  const issue = await activityDb.getActivityForUserOrThrow(db, userId, 'issues', issueId);
  ensure(issue.thingId === thingId, 'Issue must belong to this Thing');
  ensure(closed || issue.status === 'OPEN', 'Issue is resolved');
}
