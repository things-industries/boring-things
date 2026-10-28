/** Collects task and tool schemas for internal AI type generation and drift checks. */

import { schema as Transcription } from '../server/src/providers/ai/tasks/transcribe.js';
import { schema as Resolution } from '../server/src/providers/ai/tasks/resolve-thing.js';
import { schema as ResourceApplicability } from '../server/src/providers/ai/tasks/resource-applicability.js';
import { schema as SourceRecommendations } from '../server/src/providers/ai/tasks/source-recommendations.js';
import { schema as Population } from '../server/src/providers/ai/tasks/populate-fields.js';
import { schema as AdditionalInformation } from '../server/src/providers/ai/tasks/additional-information.js';
import { schema as Extraction } from '../server/src/providers/ai/tasks/extract-source.js';
import { schema as Selection } from '../server/src/providers/ai/tasks/select-field-sets.js';
import { schema as Discovery } from '../server/src/providers/ai/tasks/find-resources.js';
import { schema as DocumentExtraction } from '../server/src/providers/ai/tasks/extract-document.js';
import { schema as TaskSuggestions } from '../server/src/providers/ai/tasks/suggest-tasks.js';
import { schema as PurchasableSuggestions } from '../server/src/providers/ai/tasks/find-purchasables.js';
import { registryFunctions } from '../server/src/providers/ai/tools/registry.js';
import { chatFunctions } from '../server/src/providers/ai/tasks/assistant.js';
import { readFile, writeFile } from 'node:fs/promises';
import openapiTS, { astToString } from 'openapi-typescript';

const schemas = {
  Transcription,
  Resolution,
  ResourceApplicability,
  SourceRecommendations,
  Population,
  AdditionalInformation,
  Extraction,
  Selection,
  Discovery,
  DocumentExtraction,
  TaskSuggestions,
  PurchasableSuggestions,
  ...Object.fromEntries(
    [...registryFunctions, ...chatFunctions].map((tool) => [tool.name, tool.parameters]),
  ),
};
const generatedTypes = astToString(
  await openapiTS(
    JSON.stringify({
      openapi: '3.1.0',
      info: { title: 'AI provider outputs', version: '1' },
      paths: {},
      components: { schemas },
    }),
  ),
);
const output =
  '/**\n * Generated provider response and tool-argument types. Regenerate with pnpm ai:generate.\n */\n\n' +
  generatedTypes;
const path = new URL('../server/src/providers/ai/schema-types.ts', import.meta.url);
if (process.argv.includes('--check')) {
  if ((await readFile(path, 'utf8')) !== output)
    throw new Error('AI schema types are stale. Run pnpm ai:generate.');
} else await writeFile(path, output);
