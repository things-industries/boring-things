import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify, { type FastifyInstance } from 'fastify';
import { checkContract } from '../src/contracts/check.js';
import { installContracts, route, fastifyPath } from '../src/contracts/routes.js';
import { schemaValidator, schemaRefs } from '../src/contracts/schemas.js';
import { installErrorHandler } from '../src/routes/errors.js';
import { ApplicationError } from '../src/application/errors.js';

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
  installContracts(app);
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
