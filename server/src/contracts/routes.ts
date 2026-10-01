import type { Server, IncomingMessage, ServerResponse } from 'node:http';
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  HTTPMethods,
  RouteGenericInterface,
  RouteHandlerMethod,
} from 'fastify';
import type { paths } from '../../../shared/api.js';
import spec from '../../../openapi.json' with { type: 'json' };

import { schemaRefs, type JsonSchema } from './schemas.js';
interface Reference {
  $ref: string;
}
interface Parameter {
  name: string;
  in: string;
  required?: boolean;
  schema: JsonSchema;
}
interface Media {
  schema: JsonSchema;
}
interface Response {
  content?: Record<string, Media>;
}
interface Operation {
  parameters?: Parameter[];
  requestBody?: { content: Record<string, Media> };
  responses: Record<string, Response | Reference>;
}
type Method = Lowercase<HTTPMethods> & keyof paths[keyof paths];
type RoutePath<M extends Method> = {
  [P in keyof paths]: Exclude<paths[P][M], undefined> extends never ? never : P;
}[keyof paths];
type OperationType<P extends keyof paths, M extends keyof paths[P]> = Exclude<
  paths[P][M],
  undefined
>;
type ParametersOf<O, K extends string> = O extends { parameters: infer P }
  ? K extends keyof P
    ? NonNullable<P[K]>
    : never
  : never;
type BodyOf<O> = O extends { requestBody: { content: { 'application/json': infer B } } }
  ? B
  : never;
type ResponseBody<R> = R extends { content: { 'application/json': infer B } }
  ? B
  : R extends {
        content: { 'application/octet-stream': unknown } | { 'text/event-stream': unknown };
      }
    ? NodeJS.ReadableStream
    : void;
type Replies<O> = O extends { responses: infer R } ? { [S in keyof R]: ResponseBody<R[S]> } : never;
export type RouteTypes<P extends keyof paths, M extends keyof paths[P]> = {
  Body: BodyOf<OperationType<P, M>>;
  Params: ParametersOf<OperationType<P, M>, 'path'>;
  Querystring: ParametersOf<OperationType<P, M>, 'query'>;
  Reply: Replies<OperationType<P, M>>;
};
type Success<R> = {
  [K in keyof R]: `${K & (number | string)}` extends `2${string}` ? R[K] : never;
}[keyof R];
type Handler<R extends RouteGenericInterface> = (
  request: FastifyRequest<R>,
  reply: FastifyReply<R>,
) => Success<R['Reply']> | FastifyReply<R> | Promise<Success<R['Reply']> | FastifyReply<R>>;

// Converts OpenAPI path parameters and literal colons to Fastify route syntax.
export function fastifyPath(path: string): string {
  return path
    .split(/(\{\w+\})/)
    .map((part, index, parts) => {
      if (part.startsWith('{'))
        return ':' + part.slice(1, -1) + (parts[index + 1]?.startsWith(':') ? '([^:]+)' : '');
      return part.replaceAll(':', '::');
    })
    .join('');
}

// Resolves local OpenAPI response references and rejects unsupported references.
function responseSchema(response: Response | Reference): Response {
  if (!('$ref' in response)) return response;
  const prefix = '#/components/responses/';
  const responses: Record<string, Response> = spec.components.responses;
  const resolved =
    response.$ref.startsWith(prefix) && responses[response.$ref.slice(prefix.length)];
  if (!resolved) throw new Error(`Unsupported response reference: ${response.$ref}`);
  return resolved;
}

// Connect a Fastify route to a contract operation, validating request and response against the OpenAPI spec.
export function route<M extends Uppercase<Method>, P extends RoutePath<Lowercase<M>>>(
  app: FastifyInstance,
  method: M,
  path: P,
  handler: Handler<RouteTypes<P, Lowercase<M>>>,
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
      .map(([status, response]) => [status, responseSchema(response)] as const)
      .filter(([, response]) => response.content?.['application/json'])
      .map(([status, response]) => [status, response.content!['application/json'].schema]),
  );
  app.route<RouteTypes<P, Lowercase<M>>>({
    method: method as HTTPMethods,
    url: fastifyPath(path),
    schema: schemaRefs(schema) as JsonSchema,
    handler: handler as RouteHandlerMethod<
      Server,
      IncomingMessage,
      ServerResponse,
      RouteTypes<P, Lowercase<M>>
    >,
  });
}
