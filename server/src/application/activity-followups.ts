/** Validation of issue links and followups against owner-scoped Thing fields. */

import type { Schema } from '../../../shared/model.js';
import type { Database } from '../db/connection.js';
import * as activityDb from '../db/entities/activity.js';
import type { Registry } from './registry/registry.js';
import { detail } from './things.js';
import { ensure } from './errors.js';

/** Checks issue scope, open status and field addresses before saving followups. */
export async function validateFollowups(
  db: Database,
  owner: string,
  thingId: string,
  issueId: string | null,
  actions: Schema['CompletionAction'][],
  registry: Registry,
  closed = false,
) {
  if (issueId) {
    const issue = await activityDb.getOwnedActivityOrThrow(db, owner, 'issues', issueId);
    ensure(issue.thingId === thingId, 'Issue must belong to this Thing');
    ensure(closed || issue.status === 'OPEN', 'Issue is resolved');
  }
  const thing = await detail(db, owner, thingId, registry);
  for (const action of actions) {
    ensure(action.type !== 'RESOLVE_ISSUE' || issueId, 'Issue followup needs an issue');
    if (action.type === 'UPDATE_FIELD') {
      if (action.customFieldId) {
        ensure(
          !action.fieldId &&
            !action.fieldSetId &&
            thing.customFields.some((f) => f.id === action.customFieldId),
          'Unknown custom field',
        );
      } else {
        const fields = action.fieldSetId
          ? thing.fieldSets.find((s) => s.id === action.fieldSetId)?.fields
          : thing.standaloneFields;
        ensure(
          action.fieldId && fields?.some((f) => f.id === action.fieldId),
          'Unknown field address',
        );
      }
    }
  }
}
