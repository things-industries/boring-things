/** Checks that persisted Import failure reasons exclude private source and provider messages. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getImportFailureReason } from '../../src/application/import/types.js';

test('Import failure reasons expose validation names and database codes without private content', () => {
  for (const [error, reason] of [
    [new Error('Invalid source evidence'), 'Invalid source evidence'],
    [new Error('tool_limit'), 'tool_limit'],
    [new Error('Invalid recommendation'), 'Invalid recommendation'],
    [new Error('Uncited purchase URL'), 'Uncited purchase URL'],
    [new Error('Invalid value for Private field label'), 'Invalid field value'],
    [new Error('ai_http_429'), 'ai_http_429'],
    [Object.assign(new Error('Private database details'), { code: 'P0001' }), 'database_P0001'],
    [new Error('Private provider response'), 'import_failed'],
    ['Private thrown content', 'import_failed'],
  ] as const)
    assert.equal(getImportFailureReason(error), reason);
});
