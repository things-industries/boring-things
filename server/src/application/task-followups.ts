/** Transactional field, attachment and issue followups that close a completed Task. */

import type { Schema, ThingPatch } from '../../../shared/model.js';
import type { Database } from '../db/connection.js';
import * as tasksDb from '../db/entities/tasks.js';
import * as thingsDb from '../db/entities/things.js';
import * as importsDb from '../db/entities/imports.js';
import * as attachmentsDb from '../db/entities/attachments.js';
import { updateAttachmentMetadata } from './attachments.js';
import { writeIssue } from './activity.js';
import { patchData } from './thing-data.js';
import { validateFollowups } from './activity-followups.js';
import type { Registry } from './registry/registry.js';
import { ensure } from './errors.js';

/** Applies one saved followup and records its completion in the caller's transaction. */
export async function completeTaskFollowup(
  db: Database,
  owner: string,
  id: string,
  input: Schema['TaskFollowupInput'],
  registry: Registry,
): Promise<Schema['Task']> {
  const initial = await tasksDb.getOwnedTaskOrThrow(db, owner, id);
  const thing = await thingsDb.getOwnedThingOrThrow(db, owner, initial.thingId, { lock: true });
  const task = await tasksDb.getOwnedTaskOrThrow(db, owner, id, true);
  ensure(
    task.status === 'COMPLETED' && !task.completedFollowup,
    'Task followup unavailable',
    'CONFLICT',
  );
  const action = task.completionActions[input.actionIndex];
  ensure(action && action.type !== 'CHAT', 'Choose an available followup');
  await validateFollowups(db, owner, thing.id, task.issueId, [action], registry);

  if (action.type === 'UPDATE_FIELD') {
    ensure(input.value !== undefined && !input.attachmentId, 'Field followup needs a value');
    await importsDb.assertThingEditable(db, owner, thing.id, { allowQueued: true });
    const custom = thing.data.customFields.find((field) => field.id === action.customFieldId);
    let patch: ThingPatch;
    if (custom) {
      patch = {
        customFields: [
          { id: custom.id, label: custom.label, sensitive: custom.sensitive, value: input.value },
        ],
      };
    } else {
      ensure(action.fieldId, 'Unknown field address');
      patch = {
        values: [{ fieldSetId: action.fieldSetId, fieldId: action.fieldId, value: input.value }],
      };
    }
    await thingsDb.updateThing(db, owner, thing.id, {
      ...thing,
      data: patchData(thing.data, patch, thing.categoryId, registry),
    });
  } else if (action.type === 'ADD_ATTACHMENT') {
    ensure(
      input.attachmentId && input.value === undefined,
      'Attachment followup needs an attachment',
    );
    await importsDb.assertThingEditable(db, owner, thing.id);
    await attachmentsDb.getOwnedAttachmentOrThrow(db, owner, input.attachmentId);
    await attachmentsDb.linkAttachment(db, owner, input.attachmentId, thing.id, true);
    if (action.documentType)
      await updateAttachmentMetadata(
        db,
        owner,
        input.attachmentId,
        { documentType: action.documentType },
        { origin: 'USER', sourceRefs: [] },
      );
  } else {
    ensure(
      task.issueId && input.value === undefined && !input.attachmentId,
      'Issue followup needs an issue',
    );
    await writeIssue(db, owner, { status: 'RESOLVED' }, task.issueId);
  }
  const saved = await tasksDb.completeFollowup(db, owner, task, action);
  await thingsDb.bumpThing(db, owner, thing.id);
  return saved;
}
