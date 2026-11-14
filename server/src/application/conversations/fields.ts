/** User-requested field batches with source validation, field cards and transactional retry receipts. */

import type pg from 'pg';
import type { Schema, StoredValue, ThingPatch } from '../../../../shared/model.js';
import * as database from '../../db/connection.js';
import * as attachmentsDb from '../../db/entities/attachments.js';
import * as conversationsDb from '../../db/entities/conversations.js';
import * as thingsDb from '../../db/entities/things.js';
import type { ChatJob } from '../../db/entities/conversations.js';
import { ApplicationError, ensure } from '../errors.js';
import type { Registry } from '../registry/registry.js';
import { pinKey } from '../thing-data.js';
import { saveThing } from '../things.js';

interface FieldSource {
  attachmentId: string | null;
  page: number | null;
  url: string | null;
}

export interface ChatFieldInput {
  thingId: string;
  addFieldSetIds: string[];
  values: {
    fieldSetId: string | null;
    fieldId: string;
    value: Schema['NullableValue'];
    source: FieldSource | null;
  }[];
  customFields: {
    customFieldId: string | null;
    label: string;
    value: Schema['NullableValue'];
    valueType?: Schema['ValueTypeEnum'] | null;
    sensitive: boolean;
    scope: Schema['FieldScopeEnum'];
    source: FieldSource | null;
  }[];
}

export interface ChatFieldEvidence {
  fieldIds: Set<string>;
  setIds: Set<string>;
  attachmentIds: Set<string>;
  urls: Set<string>;
}

/** Applies one field batch or returns its receipt without repeating a previous write. */
export async function updateChatFields(
  pool: pg.Pool,
  job: ChatJob,
  input: ChatFieldInput,
  registry: Registry,
  evidence: ChatFieldEvidence,
  signal: AbortSignal,
) {
  return database.transaction(pool, async (db) => {
    signal.throwIfAborted();
    const current = await conversationsDb.getProcessingMessageOrThrow(db, job);
    const previous = current.toolResults.find((result) => result.key === 'update_thing_fields');
    if (previous) {
      ensure(
        previous.result !== null &&
          typeof previous.result === 'object' &&
          'thingId' in previous.result &&
          previous.result.thingId === input.thingId,
        'One field update per message',
      );
      return previous;
    }

    ensure(input.values.length + input.customFields.length <= 12, 'At most 12 changed fields');
    ensure(
      input.addFieldSetIds.length + input.values.length + input.customFields.length,
      'Empty field update',
    );
    ensure(
      input.addFieldSetIds.every((id) => evidence.setIds.has(id)),
      'Search for the field set first',
    );
    ensure(
      input.values.every((field) => evidence.fieldIds.has(field.fieldId)),
      'Search for the registry field first',
    );
    const currentThing = await thingsDb.getThingForUserOrThrow(db, job.userId, input.thingId, {
      lock: true,
    });
    const originalCustomIds = new Set(currentThing.data.customFields.map((field) => field.id));
    const editedCustomIds = new Set(input.customFields.map((field) => field.customFieldId));
    const provenance = new Map<string, Pick<StoredValue, 'origin' | 'sourceRefs'>>();

    // Each source must have been read this turn and still belong to the edited Thing.
    const getProvenance = async (source: FieldSource | null) => {
      if (!source)
        return { origin: 'USER', sourceRefs: [] } satisfies Pick<
          StoredValue,
          'origin' | 'sourceRefs'
        >;
      ensure(!!source.attachmentId !== !!source.url, 'Choose one source');
      if (source.attachmentId) {
        ensure(evidence.attachmentIds.has(source.attachmentId), 'Read the attachment first');
        const attachment = await attachmentsDb.getAttachmentForUserOrThrow(
          db,
          job.userId,
          source.attachmentId,
        );
        ensure(
          attachment.thingIds.includes(input.thingId),
          'Attachment is not linked to this Thing',
        );
        ensure(
          source.page === null ||
            (Number.isInteger(source.page) &&
              source.page >= 1 &&
              attachment.pageCount !== null &&
              source.page <= attachment.pageCount),
          'Invalid attachment page',
        );
        return {
          origin: 'IMPORT',
          sourceRefs: [
            { attachmentId: attachment.id, ...(source.page === null ? {} : { page: source.page }) },
          ],
        } satisfies Pick<StoredValue, 'origin' | 'sourceRefs'>;
      }
      ensure(
        source.url && evidence.urls.has(source.url) && source.page === null,
        'Use a source returned by research',
      );
      return { origin: 'DISCOVERY', sourceRefs: [{ url: source.url }] } satisfies Pick<
        StoredValue,
        'origin' | 'sourceRefs'
      >;
    };

    const customFields: NonNullable<ThingPatch['customFields']> = [];
    for (const field of input.values) {
      const key = pinKey(field);
      ensure(!provenance.has(key), 'Duplicate field address');
      ensure(field.value !== null || field.source === null, 'A value removal has no source');
      provenance.set(key, await getProvenance(field.source));
    }
    for (const [index, field] of input.customFields.entries()) {
      const key = field.customFieldId
        ? pinKey({ customFieldId: field.customFieldId })
        : `local:new:${index}`;
      ensure(!provenance.has(key), 'Duplicate field address');
      ensure(field.value !== null || field.source === null, 'A value removal has no source');
      provenance.set(key, await getProvenance(field.source));
      customFields.push({
        ...(field.customFieldId ? { id: field.customFieldId } : {}),
        label: field.label,
        value: field.value,
        valueType: field.valueType ?? undefined,
        sensitive: field.sensitive,
        scope: field.scope,
      });
    }

    let thing: Schema['Thing'];
    try {
      thing = await saveThing(
        db,
        job.userId,
        {
          addFieldSetIds: input.addFieldSetIds,
          values: input.values.map(({ source: _source, ...field }) => ({
            ...field,
            autoPopulate: false,
          })),
          customFields,
        },
        registry,
        input.thingId,
        provenance,
      );
    } catch (error) {
      if (
        error instanceof ApplicationError &&
        error.kind === 'CONFLICT' &&
        error.message === 'Thing is processing an import'
      )
        throw new ApplicationError(
          'INVALID_INPUT',
          'Thing is processing an import; try again after it finishes',
        );
      throw error;
    }
    const changedFields = [
      ...input.values.map(({ fieldSetId, fieldId }) => ({
        fieldSetId,
        fieldId,
        customFieldId: null,
        name: registry.fields.get(fieldId)!.name,
      })),
      ...thing.customFields
        .filter((field) => !originalCustomIds.has(field.id) || editedCustomIds.has(field.id))
        .map((field) => ({
          fieldSetId: null,
          fieldId: null,
          customFieldId: field.id,
          name: field.label,
        })),
    ];
    const cards: Schema['ResourceCard'][] = changedFields.map((field) => ({
      type: 'FIELD',
      thingId: thing.id,
      fieldSetId: field.fieldSetId,
      fieldId: field.fieldId,
      ...(field.customFieldId ? { customFieldId: field.customFieldId } : {}),
    }));
    const receipt = {
      key: 'update_thing_fields',
      result: { thingId: thing.id, addedFieldSetIds: input.addFieldSetIds, changedFields },
      cards,
    };
    await conversationsDb.saveMessage(db, job, { toolResults: [...current.toolResults, receipt] });
    signal.throwIfAborted();
    return receipt;
  });
}
