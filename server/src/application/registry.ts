import { Ajv, type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import type { FieldDefinition, FieldSet, Value } from '../../../shared/model.js';
import { ensure } from './errors.js';
import { rows, type Database } from '../db/connection.js';

export class Registry {
  fields: Map<string, FieldDefinition>;
  sets: Map<string, FieldSet>;
  private validators = new Map<string, ValidateFunction>();
  constructor(fields: FieldDefinition[], sets: FieldSet[]) {
    this.fields = new Map(fields.map((f) => [f.id, f]));
    this.sets = new Map(sets.map((s) => [s.id, s]));
    ensure(
      this.fields.size === fields.length && this.sets.size === sets.length,
      'Duplicate registry IDs',
    );
    const ajv = new Ajv({ strict: true, coerceTypes: false });
    addFormats.default(ajv);
    for (const f of fields) {
      ensure(f.uiHint !== 'password' || f.sensitive, 'Password fields must be sensitive');
      this.validators.set(f.id, ajv.compile(f.schema));
    }
    for (const set of sets) {
      ensure(
        set.fields.every((f) => this.fields.has(f.id)),
        `Unknown field in ${set.id}`,
      );
      for (const id of [...set.includes, ...set.considerAlongside])
        ensure(this.sets.get(id)?.categoryId === set.categoryId, `Invalid relation ${id}`);
      this.expand([set.id], set.categoryId);
    }
  }
  expand(ids: string[], categoryId: string): string[] {
    const done = new Set<string>(),
      visiting = new Set<string>();
    const visit = (id: string) => {
      ensure(!visiting.has(id), 'Field-set inclusion cycle');
      if (done.has(id)) return;
      const set = this.sets.get(id);
      ensure(set && set.categoryId === categoryId, 'Unknown or incompatible field set');
      visiting.add(id);
      for (const dependency of set.includes) visit(dependency);
      visiting.delete(id);
      done.add(id);
    };
    ids.forEach(visit);
    return [...done];
  }
  validate(fieldId: string, value: Value) {
    const validator = this.validators.get(fieldId);
    ensure(validator, 'Unknown field');
    ensure(validator(value), `Invalid value for ${this.fields.get(fieldId)!.name}`);
  }
}
export async function loadRegistry(db: Database) {
  const fields = await rows<FieldDefinition>(db, 'select * from bt.field_definitions order by id');
  const sets = await rows<Omit<FieldSet, 'fields'> & { fieldIds: string[] }>(
    db,
    'select * from bt.field_sets order by id',
  );
  return new Registry(
    fields,
    sets.map((s) => ({
      ...s,
      fields: s.fieldIds.map((id) => {
        const f = fields.find((f) => f.id === id);
        ensure(f, 'Unknown field in registry');
        return f;
      }),
    })),
  );
}
