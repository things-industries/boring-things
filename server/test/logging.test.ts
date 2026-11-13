// Verifies request log severity and continued visibility of sanitised server errors.

import { setEnvMode, setEnvValue } from '../src/config.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { loggerOptions, RequestLogController } from '../src/http/logging.js';
import { installErrorHandler } from '../src/routes/errors.js';

for (const level of ['info', 'trace']) {
  test(`request diagnostics at ${level} preserve server error logs`, async (t) => {
    const lines: string[] = [];
    setEnvMode('test');
    setEnvValue('LOG_FORMAT', 'json');
    setEnvValue('LOG_LEVEL', level);
    t.after(() => setEnvMode('runtime'));
    const controller = new RequestLogController();
    const app = Fastify({
      logger: { ...loggerOptions(), stream: { write: (line) => lines.push(line) } },
      logController: controller,
    });
    t.after(() => app.close());
    installErrorHandler(app);
    app.get('/api/things/:id', async () => ({ status: 'ok' }));
    app.get('/failure', async () => {
      throw new Error('Private failure details');
    });
    app.get('/stream-errors', async (request, reply) => {
      controller.streamError(
        Object.assign(new Error('Disconnect'), { code: 'ERR_STREAM_PREMATURE_CLOSE' }),
        request,
        reply,
      );
      controller.streamError(new Error('Stream failure'), request, reply);
      return { status: 'ok' };
    });
    assert.equal(
      (await app.inject('/api/things/example?filter=private_query_detail')).statusCode,
      200,
    );
    assert.equal((await app.inject('/failure')).statusCode, 500);
    assert.equal((await app.inject('/stream-errors')).statusCode, 200);

    const records = lines.map((line) => JSON.parse(line));
    const requests = records.filter((record) => record.event === 'request_started');
    const responses = records.filter((record) => record.event === 'request_completed');
    assert.equal(requests.length, level === 'trace' ? 3 : 0);
    assert.equal(responses.length, level === 'trace' ? 3 : 0);
    if (level === 'trace') {
      assert.partialDeepStrictEqual(responses[0], {
        route: '/api/things/:id',
        statusCode: 200,
        level: 10,
      });
      assert.equal(typeof responses[0].elapsedMs, 'number');
      assert.equal(typeof responses[0].requestId, 'string');
    }
    const errors = records.filter((record) => record.level === 50);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].event, 'request_failed');
    assert.equal(errors[0].reason, 'unexpected_error');
    assert.doesNotMatch(
      lines.join(''),
      /Private failure details|private_query_detail|Stream failure/,
    );
    const disconnects = records.filter((record) => record.reason === 'client_disconnect');
    assert.equal(disconnects.length, level === 'trace' ? 1 : 0);
    const streamFailures = records.filter(
      (record) => record.event === 'response_stream_closed' && record.level === 40,
    );
    assert.equal(streamFailures.length, 1);
  });
}
