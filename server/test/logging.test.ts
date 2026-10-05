// Verifies request log severity and continued visibility of sanitised server errors.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { readConfig } from '../src/config.js';
import { loggerOptions, RequestLogController } from '../src/http/logging.js';
import { installErrorHandler } from '../src/routes/errors.js';

for (const level of ['info', 'trace']) {
  test(`request diagnostics at ${level} preserve server error logs`, async (t) => {
    const lines: string[] = [];
    const config = readConfig({ LOG_FORMAT: 'json', LOG_LEVEL: level });
    const controller = new RequestLogController();
    const app = Fastify({
      logger: { ...loggerOptions(config), stream: { write: (line) => lines.push(line) } },
      logController: controller,
    });
    t.after(() => app.close());
    installErrorHandler(app);
    app.get('/ok', async () => ({ status: 'ok' }));
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
    assert.equal((await app.inject('/ok')).statusCode, 200);
    assert.equal((await app.inject('/failure')).statusCode, 500);
    assert.equal((await app.inject('/stream-errors')).statusCode, 200);

    const records = lines.map((line) => JSON.parse(line));
    const requests = records.filter((record) => record.msg === 'incoming request');
    const responses = records.filter((record) => record.msg === 'request completed');
    assert.equal(requests.length, level === 'trace' ? 3 : 0);
    assert.equal(responses.length, level === 'trace' ? 3 : 0);
    for (const record of [...requests, ...responses]) {
      assert.equal(record.level, 10);
      assert.equal(typeof record.reqId, 'string');
    }
    if (level === 'trace') {
      assert.equal(requests[0].req.url, '/ok');
      assert.equal(responses[0].res.statusCode, 200);
      assert.equal(typeof responses[0].responseTime, 'number');
    }
    const errors = records.filter((record) => record.level === 50);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].msg, 'Request failed');
    assert.equal(errors[0].code, 'Error');
    assert.ok(!lines.join('').includes('Private failure details'));
    const disconnects = records.filter((record) => record.msg === 'stream closed prematurely');
    assert.equal(disconnects.length, level === 'trace' ? 1 : 0);
    if (disconnects.length) assert.equal(disconnects[0].level, 10);
    const streamFailures = records.filter(
      (record) => record.msg === 'response terminated with an error with headers already sent',
    );
    assert.equal(streamFailures.length, 1);
    assert.equal(streamFailures[0].level, 40);
  });
}
