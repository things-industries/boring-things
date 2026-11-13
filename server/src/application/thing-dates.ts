/** Projection of populated, unmasked date fields into future timeline entries. */

import type { Schema } from '../../../shared/model.js';
import type { Database } from '../db/connection.js';
import type { RouteTypes } from '../contracts/routes.js';
import * as database from '../db/connection.js';
import * as thingFieldsDb from '../db/entities/thing-fields.js';
import type { Registry } from './registry/registry.js';
import { projectData } from './thing-data.js';
import { isCalendarDate } from './custom-fields.js';
import type { ThingData } from '../../../shared/model.js';
import { getLocalDate } from './task-recurrence.js';
import { page, pageResult } from './pagination.js';

/** Reads upcoming date fields using the stored field occurrences and masking rules. */
export async function listThingDates(
  db: Database,
  owner: string,
  registry: Registry,
  query: RouteTypes<'/api/thing-dates', 'get'>['Querystring'],
) {
  const today = getLocalDate(new Date(), query.timeZone ?? 'UTC');
  const from = query.from && query.from > today ? query.from : today;
  const things = await database.rows<{ id: string; data: ThingData }>(
    db,
    'select id,data from bt.things where owner_id=$1 and ($2::uuid is null or id=$2) order by id',
    [owner, query.thingId ?? null],
  );
  const items: Schema['ThingDate'][] = [];
  for (const thing of things) {
    const detail = projectData(await thingFieldsDb.load(db, owner, thing.id, thing.data), registry);
    const add = (
      label: string,
      value: Schema['NullableValue'],
      masked: boolean,
      address: Pick<Schema['ThingDate'], 'fieldId' | 'fieldSetId' | 'customFieldId'>,
    ) => {
      if (!masked && typeof value === 'string' && value >= from && (!query.to || value <= query.to))
        items.push({ thingId: thing.id, label, date: value, ...address });
    };
    for (const set of detail.fieldSets)
      for (const field of set.fields)
        if (field.schema.format === 'date' && isCalendarDate(field.value))
          add(field.name, field.value, field.masked, {
            fieldId: field.id,
            fieldSetId: set.id,
            customFieldId: null,
          });
    for (const field of detail.standaloneFields)
      if (field.schema.format === 'date' && isCalendarDate(field.value))
        add(field.name, field.value, field.masked, {
          fieldId: field.id,
          fieldSetId: null,
          customFieldId: null,
        });
    for (const field of detail.customFields)
      if (field.valueType === 'DATE')
        add(field.label, field.value, field.masked, {
          fieldId: null,
          fieldSetId: null,
          customFieldId: field.id,
        });
  }
  items.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.thingId.localeCompare(b.thingId) ||
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
  );
  const { limit, offset } = page(query);
  return pageResult(items.slice(offset, offset + limit + 1), query);
}
