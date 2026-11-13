/** Checks that Sentry diagnostics exclude request data and private record IDs. */

// cspell:words logentry

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getSentryOptions } from '../../shared/sentry.js';
import * as Sentry from '@sentry/node';
import Fastify from 'fastify';
import { setEnvMode, setEnvValue } from '../src/config.js';
import { flushSentry, initializeSentry } from '../src/sentry.js';
import { installErrorHandler } from '../src/routes/errors.js';
import { RequestLogController } from '../src/http/logging.js';

test('Sentry diagnostics keep route templates and strip raw request data', () => {
  const options = getSentryOptions('production');
  const path = '/api/things/00000000-0000-4000-8000-000000000001?secret=example';
  const event = options.beforeSend({
    transaction: 'GET ' + path,
    request: { url: path },
    user: { email: 'user@example.test' },
    extra: { payload: 'private content' },
    message: 'Private error message',
    logentry: { message: 'Private log message' },
    exception: { values: [{ value: 'Private source content', stacktrace: { frames: [] } }] },
  });
  assert.deepEqual(event, {
    transaction: 'GET /api/things/:id',
    message: 'Application error',
    exception: { values: [{ value: 'Exception details redacted', stacktrace: { frames: [] } }] },
  });
  const span = options.beforeSendSpan({
    name: 'GET ' + path,
    attributes: {
      'http.route': '/api/things/:id',
      'http.response.status_code': 500,
      'url.full': path,
      'exception.message': 'private content',
    },
  });
  assert.deepEqual(span, {
    name: 'GET /api/things/:id',
    attributes: { 'http.route': '/api/things/:id', 'http.response.status_code': 500 },
  });
});

// Sentry's source context copied the original exception text into an otherwise redacted event.
test('an API exception sends one Sentry issue and a duration metric without request data', async (t) => {
  setEnvMode('test');
  setEnvValue('SENTRY_DSN', 'https://fixture@example.invalid/1');
  initializeSentry();
  t.after(async () => {
    await Sentry.close();
    setEnvMode('runtime');
  });
  const transport = Sentry.getClient()?.getTransport();
  assert(transport);
  const send = t.mock.method(transport, 'send', async () => ({ statusCode: 200 }));
  const app = Fastify({ logController: new RequestLogController() });
  t.after(() => app.close());
  installErrorHandler(app);
  app.get('/api/failure', async () => {
    throw new Error('private exception detail');
  });
  const response = await app.inject('/api/failure?filter=private_query_detail');
  assert.equal(response.statusCode, 500);
  await flushSentry();
  const envelopes = send.mock.calls
    .map((call) => call.arguments[0])
    .filter((item) => item !== undefined);
  const types = envelopes.flatMap(([, items]) => items.map(([header]) => header.type));
  assert.equal(types.filter((type) => type === 'event').length, 1);
  const serialized = JSON.stringify(envelopes.map(([, items]) => items));
  assert.match(serialized, /api.request.duration/);
  assert.match(serialized, /requestId/);
  assert.equal(/private exception detail|private_query_detail/.test(serialized), false);
});
