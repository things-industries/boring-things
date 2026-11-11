/** Checks that browser integration settings survive selection of the application test environment. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getEnv, setEnvMode } from '../../src/config.js';
import { chromiumExecutable } from '../support/chromium.js';

// PR #155 dropped the browser override when the application harness selected test mode.
test('test mode keeps the Chromium override without importing runtime credentials', (t) => {
  const previous = process.env;
  process.env = {
    PLAYWRIGHT_CHROMIUM_EXECUTABLE: '/synthetic/chromium',
    OPENAI_API_KEY: 'runtime-secret',
  };
  t.after(() => {
    process.env = previous;
    setEnvMode('runtime');
  });
  setEnvMode('runtime');
  assert.equal(chromiumExecutable(), '/synthetic/chromium');
  setEnvMode('test');
  assert.equal(chromiumExecutable(), '/synthetic/chromium');
  assert.equal(getEnv('OPENAI_API_KEY'), 'test-key');
});
