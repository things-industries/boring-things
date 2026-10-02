import { Readable } from 'node:stream';
import spec from '../../openapi.json' with { type: 'json' };
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify, { type FastifyInstance } from 'fastify';
import { checkContract } from '../src/contracts/check.js';
import { route, fastifyPath } from '../src/contracts/routes.js';
import {
  schemaValidator,
  schemaRefs,
  schemas,
  createValidatorCompiler,
} from '../src/contracts/schemas.js';
import { installErrorHandler } from '../src/routes/errors.js';
import { ApplicationError } from '../src/application/errors.js';
import type { ThingPatch } from '../../shared/model.js';

// These assertions exercise operation inference; the function is never invoked.
function typeChecks(app: FastifyInstance) {
  route(app, 'POST', '/api/tags', async (req, reply) => {
    const name: string = req.body.name;
    // @ts-expect-error Tag input has no Thing name/category contract.
    void req.body.categoryId;
    // @ts-expect-error This operation has no path parameters.
    void req.params.id;
    // @ts-expect-error Tag creation does not return 202.
    reply.code(202);
    // @ts-expect-error Response requires id and name.
    reply.code(201).send({ name });
    return reply.code(201).send({ id: 'tag', name });
  });
  route(app, 'GET', '/api/conversations/{id}/stream', (_req, reply) => {
    // @ts-expect-error SSE success requires a readable stream.
    reply.code(200).send({ messages: [] });
    return reply
      .type('text/event-stream')
      .code(200)
      .send(Readable.from(['event: snapshot\n\n']));
  });
  // @ts-expect-error GET has no JSON body.
  route(app, 'GET', '/api/tags', (req) => req.body.name);
  // @ts-expect-error Unknown method/path pair.
  route(app, 'DELETE', '/api/config', async () => ({}));
  // @ts-expect-error Invalid response body.
  route(app, 'GET', '/api/profile', async () => ({ wrong: true }));
}
void typeChecks;

test('contract documentation, enum references and path conversion stay consistent', () => {
  checkContract();
  assert.equal(
    fastifyPath('/api/things/{id}:reveal-field'),
    '/api/things/:id([^:]+)::reveal-field',
  );
  assert.equal(fastifyPath('/api/things:import'), '/api/things::import');
  assert.throws(() => schemaRefs({ $ref: 'https://example.com/schema' }), /Unsupported/);
  assert.throws(() => schemaRefs({ $ref: '#/components/schemas/Missing' }), /Unknown/);
  const validate = schemaValidator('Money');
  assert.ok(validate({ amountMinor: 0, currency: 'GBP' }));
  assert.equal(validate({ amountMinor: 0, currency: 'gbp' }), false);
});

test('OpenAPI 3.1 nulls, response omission and action-path validation work in Fastify', async (t) => {
  const app = Fastify();
  t.after(() => app.close());
  for (const schema of schemas) app.addSchema(schema);
  app.setValidatorCompiler(createValidatorCompiler());
  installErrorHandler(app);
  const id = '00000000-0000-4000-8000-000000000001';
  route(app, 'PATCH', '/api/events/{id}', async (req) => ({
    id: req.params.id,
    thingId: id,
    title: 'Event',
    description: '',
    status: 'SUGGESTED' as const,
    startsAt: req.body.startsAt ?? null,
    startsOn: req.body.startsOn ?? null,
    completedAt: null,
    issueId: null,
    sourceRefs: [],
    isSample: false,
    createdAt: '2026-09-30T00:00:00Z',
    updatedAt: '2026-09-30T00:00:00Z',
    privateSecret: 'hidden',
  }));
  route(app, 'POST', '/api/things/{id}:reveal-field', async () => ({ value: null }));
  let response = await app.inject({
    method: 'PATCH',
    url: `/api/events/${id}`,
    payload: { startsAt: null },
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().startsAt, null);
  assert.equal(response.json().privateSecret, undefined);
  response = await app.inject({
    method: 'PATCH',
    url: `/api/events/${id}`,
    payload: { status: 'suggested' },
  });
  assert.equal(response.statusCode, 422);
  response = await app.inject({
    method: 'POST',
    url: '/api/things/not-a-uuid:reveal-field',
    payload: { fieldId: 'test', fieldSetId: null },
  });
  assert.equal(response.statusCode, 422);
  response = await app.inject({
    method: 'POST',
    url: `/api/things/${id}:reveal-field`,
    payload: { fieldId: 'test', fieldSetId: null },
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json(), { value: null });
});

test('application errors map at the HTTP boundary and unexpected details stay private', async (t) => {
  const app = Fastify();
  t.after(() => app.close());
  installErrorHandler(app);
  app.get('/missing', async () => {
    throw new ApplicationError('NOT_FOUND', 'Thing not found');
  });
  app.get('/broken', async () => {
    throw new Error('secret database data');
  });
  assert.equal((await app.inject('/missing')).statusCode, 404);
  const response = await app.inject('/broken');
  assert.equal(response.statusCode, 500);
  assert.equal(response.body.includes('secret'), false);
});

test('nested route plugins inherit coercion, rejection and response serialization rules', async (t) => {
  const app = Fastify();
  t.after(() => app.close());
  for (const schema of schemas) app.addSchema(schema);
  app.setValidatorCompiler(createValidatorCompiler());
  installErrorHandler(app);
  const id = '00000000-0000-4000-8000-000000000001';
  let limit: number | undefined;
  let cursor: string | undefined;
  let patch: ThingPatch | undefined;
  let tagCalls = 0;
  await app.register(async (api) => {
    await api.register(async (feature) => {
      route(feature, 'GET', '/api/tags', async (request) => {
        limit = request.query.limit;
        cursor = request.query.cursor;
        tagCalls++;
        return { items: [{ id, name: 'Tag', privateSecret: 'hidden' }], nextCursor: null };
      });
      route(feature, 'PATCH', '/api/things/{id}', async (request) => {
        patch = request.body;
        throw new ApplicationError('NOT_FOUND', 'Thing not found');
      });
    });
  });

  const response = await app.inject('/api/tags?limit=2&cursor=next-page');
  assert.equal(response.statusCode, 200);
  assert.equal(limit, 2);
  assert.equal(cursor, 'next-page');
  assert.deepEqual(response.json(), { items: [{ id, name: 'Tag' }], nextCursor: null });
  assert.equal((await app.inject('/api/tags')).statusCode, 200);
  assert.equal(limit, undefined);
  assert.equal(cursor, undefined);
  for (const query of [
    'limit=invalid',
    'limit=0',
    'limit=101',
    'cursor=' + 'x'.repeat(33),
    'limit=2&extra=secret',
  ]) {
    assert.equal((await app.inject('/api/tags?' + query)).statusCode, 422);
  }
  assert.equal(tagCalls, 2);

  for (const payload of [{ name: 42 }, { extra: 'secret' }]) {
    const invalid = await app.inject({ method: 'PATCH', url: `/api/things/${id}`, payload });
    assert.equal(invalid.statusCode, 422);
    assert.deepEqual(invalid.json(), { message: 'Invalid request', statusCode: 422 });
    assert.equal(patch, undefined);
  }
  const payload = {
    description: '',
    imageAttachmentId: null,
    values: [false, 0, '', null].map((value, index) => ({
      fieldSetId: null,
      fieldId: 'field' + index,
      value,
    })),
  };
  const accepted = await app.inject({ method: 'PATCH', url: `/api/things/${id}`, payload });
  assert.equal(accepted.statusCode, 404);
  assert.deepEqual(patch, payload);
});

test('route registration resolves shared response schemas and rejects unsupported references', async (t) => {
  const app = Fastify();
  t.after(() => app.close());
  for (const schema of schemas) app.addSchema(schema);
  app.setValidatorCompiler(createValidatorCompiler());
  route(app, 'GET', '/api/tags', async (_req, reply) => {
    const error = { message: 'Sign in required', statusCode: 401, privateSecret: 'hidden' };
    return reply.code(401).send(error);
  });
  const response = await app.inject('/api/tags');
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { message: 'Sign in required', statusCode: 401 });

  const reference = spec.paths['/api/tags'].get.responses['401'];
  const original = reference.$ref;
  try {
    for (const value of ['https://example.com/response', '#/components/responses/Missing']) {
      reference.$ref = value;
      const invalid = Fastify();
      try {
        assert.throws(
          () => route(invalid, 'GET', '/api/tags', async () => ({ items: [], nextCursor: null })),
          /Unsupported response reference/,
        );
      } finally {
        await invalid.close();
      }
    }
  } finally {
    reference.$ref = original;
  }
});
