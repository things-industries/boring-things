/** Builds isolated Import task contexts for fixture data, retrieval tracking and usage checks. */

import type { ImportTaskContext } from '../../src/application/import/types.js';

// Creates fresh source scope, retrieval records and tool budget for each test run.
export function createImportTaskContext(
  overrides: Partial<ImportTaskContext> = {},
): ImportTaskContext {
  return {
    signal: new AbortController().signal,
    record: async () => {},
    categoryId: 'appliances',
    sources: [],
    retrievedSetIds: new Set<string>(),
    retrievedFieldIds: new Set<string>(),
    toolCalls: 0,
    toolCallLimit: 4,
    ...overrides,
  };
}
