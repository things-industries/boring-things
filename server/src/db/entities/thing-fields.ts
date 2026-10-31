/** Persists field occurrences independently of the Thing's selection, pin and display metadata. */
import type { Database } from '../connection.js';
import * as database from '../connection.js';
import type { LocalField, Schema, StoredValue, ThingData } from '../../../../shared/model.js';

interface FieldRow extends StoredValue {
  fieldKey: string;
  fieldId: string | null;
  fieldSetId: string | null;
  customDefinition: Omit<LocalField, keyof StoredValue> | null;
}

// Separates Thing metadata from field values stored in their own table.
export function metadata(data: ThingData) {
  const { values: _values, standalone: _standalone, customFields: _custom, ...remaining } = data;
  return remaining;
}

// Loads all occurrences in one query and groups them for the application field interface.
export async function load(db: Database, owner: string, thingId: string, data: ThingData) {
  const fields = await database.rows<FieldRow>(
    db,
    'select field_key,field_id,field_set_id,value,auto_populate,origin,source_refs,custom_definition from bt.thing_fields where thing_id=$1 and owner_id=$2 order by field_key',
    [thingId, owner],
  );
  const result: ThingData = {
    ...data,
    setIds: data.setIds ?? [],
    pins: data.pins ?? [],
    values: {},
    standalone: {},
    customFields: [],
  };
  for (const row of fields) {
    const stored: StoredValue = {
      value: row.value,
      autoPopulate: row.autoPopulate,
      origin: row.origin,
      sourceRefs: row.sourceRefs,
    };
    if (row.customDefinition) result.customFields.push({ ...row.customDefinition, ...stored });
    else if (row.fieldId) {
      const target = row.fieldSetId ? (result.values[row.fieldSetId] ??= {}) : result.standalone;
      target[row.fieldId] = stored;
    }
  }
  return result;
}

// Saves the validated field snapshot within the caller's Thing transaction.
export async function save(db: Database, owner: string, thingId: string, data: ThingData) {
  const fields: FieldRow[] = [];
  for (const [setId, entries] of Object.entries(data.values))
    for (const [fieldId, value] of Object.entries(entries))
      fields.push({
        ...value,
        fieldKey: `${setId}:${fieldId}`,
        fieldId,
        fieldSetId: setId,
        customDefinition: null,
      });
  for (const [fieldId, value] of Object.entries(data.standalone))
    fields.push({
      ...value,
      fieldKey: `:${fieldId}`,
      fieldId,
      fieldSetId: null,
      customDefinition: null,
    });
  for (const field of data.customFields) {
    const { value, origin, sourceRefs, autoPopulate, ...definition } = field;
    fields.push({
      value,
      origin,
      sourceRefs,
      autoPopulate,
      fieldKey: `local:${field.id}`,
      fieldId: null,
      fieldSetId: null,
      customDefinition: definition,
    });
  }
  await database.execute(
    db,
    'delete from bt.thing_fields where thing_id=$1 and owner_id=$2 and not(field_key=any($3::text[]))',
    [thingId, owner, fields.map((field) => field.fieldKey)],
  );
  await database.execute(
    db,
    `insert into bt.thing_fields(thing_id,owner_id,field_key,field_id,field_set_id,value,auto_populate,origin,source_refs,custom_definition)
     select $1,$2,f."fieldKey",f."fieldId",f."fieldSetId",nullif(f.value,'null'::jsonb),f."autoPopulate",f.origin,f."sourceRefs",f."customDefinition"
     from jsonb_to_recordset($3::jsonb) as f("fieldKey" text,"fieldId" text,"fieldSetId" text,value jsonb,"autoPopulate" boolean,origin text,"sourceRefs" jsonb,"customDefinition" jsonb)
     on conflict(thing_id,field_key) do update set value=excluded.value,auto_populate=excluded.auto_populate,
       origin=excluded.origin,source_refs=excluded.source_refs,custom_definition=excluded.custom_definition`,
    [
      thingId,
      owner,
      JSON.stringify(
        fields.map((field) => ({
          ...field,
          autoPopulate: field.autoPopulate ?? field.origin !== 'USER',
        })),
      ),
    ],
  );
}

// Retrieves the owner's category-valid identifiers for candidate matching.
export async function identifiers(db: Database, owner: string, categoryId: string) {
  return database.rows<{ thingId: string; fieldId: string; value: Schema['Value'] }>(
    db,
    `select f.thing_id,f.field_id,f.value from bt.thing_fields f
     join bt.things t on t.id=f.thing_id join bt.field_definitions d on d.id=f.field_id
     where f.owner_id=$1 and t.category_id=$2 and d.identifier_kind<>'NONE' and f.value is not null`,
    [owner, categoryId],
  );
}
