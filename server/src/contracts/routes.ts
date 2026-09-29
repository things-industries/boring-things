import type { FastifyInstance, FastifyReply, FastifyRequest, HTTPMethods } from 'fastify';
import { Ajv, type AnySchema } from 'ajv';
import addFormats from 'ajv-formats';
import spec from '../../../openapi.json' with { type: 'json' };

interface JsonSchema {
  [key: string]: unknown;
}
interface Operation {
  parameters?: { name: string; in: string; required?: boolean; schema: JsonSchema }[];
  requestBody?: { content: Record<string, { schema: JsonSchema }> };
  responses: Record<string, { content?: Record<string, { schema: JsonSchema }> }>;
}
function refs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(refs);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, value]) => [
        key,
        key === '$ref' && typeof value === 'string'
          ? value.replace('#/components/schemas/', '') + '#'
          : refs(value),
      ]),
    );
  return value;
}
export function installContracts(app: FastifyInstance) {
  const bodyAjv = new Ajv({ strict: false, coerceTypes: false, removeAdditional: false });
  const queryAjv = new Ajv({ strict: false, coerceTypes: true, removeAdditional: false });
  for (const ajv of [bodyAjv, queryAjv]) addFormats.default(ajv);
  for (const [name, schema] of Object.entries(spec.components.schemas)) {
    const resolved = { ...(refs(schema) as JsonSchema), $id: name };
    app.addSchema(resolved);
    bodyAjv.addSchema(resolved);
    queryAjv.addSchema(resolved);
  }
  app.setValidatorCompiler(({ schema, httpPart }) =>
    (httpPart === 'querystring' ? queryAjv : bodyAjv).compile(schema as AnySchema),
  );
}
export interface Query {
  limit?: number;
  cursor?: string;
  q?: string;
  categoryId?: string;
  tagId?: string;
  thingId?: string;
  status?: string;
  kind?: string;
  from?: string;
  to?: string;
}
export type Request<B = unknown> = FastifyRequest<{
  Body: B;
  Params: { id: string; thingId: string };
  Querystring: Query;
}>;
export function route<B = unknown>(
  app: FastifyInstance,
  method: HTTPMethods,
  path: string,
  handler: (request: Request<B>, reply: FastifyReply) => unknown,
) {
  const paths = spec.paths as unknown as Record<string, Record<string, Operation>>;
  const operation = paths[path]?.[method.toLowerCase()];
  if (!operation) throw new Error(`No contract for ${method} ${path}`);
  const schema: Record<string, unknown> = {};
  for (const [location, key] of [
    ['path', 'params'],
    ['query', 'querystring'],
  ]) {
    const params = operation.parameters?.filter((p) => p.in === location) ?? [];
    if (params.length)
      schema[key] = {
        type: 'object',
        additionalProperties: false,
        properties: Object.fromEntries(params.map((p) => [p.name, p.schema])),
        required: params.filter((p) => p.required).map((p) => p.name),
      };
  }
  const body = operation.requestBody?.content['application/json'];
  if (body) schema.body = body.schema;
  schema.response = Object.fromEntries(
    Object.entries(operation.responses)
      .filter(([, r]) => r.content?.['application/json'])
      .map(([status, r]) => [status, r.content!['application/json'].schema]),
  );
  app.route({
    method,
    url: path
      .replace(/\{(\w+)\}/g, ':$1')
      .replace(':id:reveal-field', ':id([^:]+)::reveal-field')
      .replace(':seed-samples', '::seed-samples'),
    schema: refs(schema) as Record<string, unknown>,
    handler,
  });
}
