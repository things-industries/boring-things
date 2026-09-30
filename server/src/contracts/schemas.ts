import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import spec from '../../../openapi.json' with { type: 'json' };
import type { Schema } from '../../../shared/model.js';

export interface JsonSchema {
  [key: string]: unknown;
}
export function schemaRefs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(schemaRefs);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => {
      if (key === '$ref') {
        if (typeof entry !== 'string' || !/^#\/components\/schemas\/[\w-]+$/.test(entry))
          throw new Error(`Unsupported schema reference: ${String(entry)}`);
        const name = entry.slice('#/components/schemas/'.length);
        if (!(name in spec.components.schemas)) throw new Error(`Unknown schema: ${name}`);
        return [key, name + '#'];
      }
      return [key, schemaRefs(entry)];
    }),
  );
}
export const schemas = Object.entries(spec.components.schemas).map(([name, schema]) => ({
  ...(schemaRefs(schema) as JsonSchema),
  $id: name,
}));
export function createValidator(coerceTypes = false) {
  const ajv = new Ajv2020({ strict: false, coerceTypes, removeAdditional: false });
  addFormats.default(ajv);
  for (const schema of schemas) ajv.addSchema(schema);
  return ajv;
}
const validator = createValidator();
export function schemaValidator<K extends keyof Schema>(name: K) {
  return validator.getSchema<Schema[K]>(name)!;
}
