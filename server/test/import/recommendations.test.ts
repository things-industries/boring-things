/** Verifies independent recommendation proposals with mocked model responses. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OpenAiImports } from '../../src/providers/ai/openai-imports.js';
import { setEnvMode } from '../../src/env.js';
import type { ImportTaskContext } from '../../src/application/import/types.js';

// One malformed suggestion rejected every otherwise usable recommendation in the model response.
test('recommendations accept missing citations and skip malformed peers and purchase links', async (t) => {
  setEnvMode('test');
  const title = 'Review the renewal';
  const product = {
    kind: 'CONSUMABLE',
    name: 'Replacement filter',
    description: 'Replace when needed.',
    merchantUrl: 'https://shop.example/filter',
    sourceRefs: [],
  };
  let items: unknown[] = [
    {
      title,
      description: 'Review annually.',
      sourceRefs: [],
      importance: 'RECOMMENDED',
      recurrence: null,
      scheduledOn: null,
      deadlineOn: null,
      completionActions: [],
    },
    { title: 12 },
  ];
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({
      status: 'completed',
      output: [
        { type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ items }) }] },
      ],
    }),
  );
  const context: ImportTaskContext = {
    signal: new AbortController().signal,
    record: async () => {},
    categoryId: 'appliances',
    sources: [],
    retrievedFieldIds: new Set(),
    retrievedSetIds: new Set(),
    toolCalls: 0,
    toolCallLimit: 4,
  };
  const research = {
    categoryId: 'appliances',
    knownFields: [
      { fieldSetId: null, fieldId: 'common.model', label: 'Model', description: '', value: 'AX1' },
    ],
    fields: [],
    sources: [],
    referenceUrls: [],
  };
  const ai = new OpenAiImports();
  assert.deepEqual((await ai.suggestTasks({ ...research, existingTasks: [] }, context)).items, [
    {
      title,
      description: 'Review annually.',
      sourceRefs: [],
      importance: 'RECOMMENDED',
      recurrence: null,
      scheduledOn: null,
      deadlineOn: null,
      completionActions: [],
    },
  ]);
  items = [
    product,
    { ...product, merchantUrl: 'javascript:invalid' },
    { ...product, kind: 'INVALID' },
  ];
  assert.deepEqual(
    (await ai.findPurchasables({ ...research, existingPurchasables: [] }, context)).items,
    [product],
  );
});
