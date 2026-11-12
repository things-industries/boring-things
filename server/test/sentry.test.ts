/** Checks that Sentry diagnostics exclude request data and private record IDs. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getSentryOptions } from '../../shared/sentry.js';

test('Sentry diagnostics keep route templates and strip raw request data', () => {
  const options = getSentryOptions('production');
  const path = '/api/things/00000000-0000-4000-8000-000000000001?secret=example';
  const event = options.beforeSend({
    transaction: 'GET ' + path,
    request: { url: path },
    user: { email: 'user@example.test' },
    extra: { payload: 'private content' },
  });
  assert.deepEqual(event, { transaction: 'GET /api/things/:id' });
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
