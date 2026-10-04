/**
 * Generates provider response and tool-argument types from authored AI schemas; --check detects drift.
 */

import { readFile, writeFile } from 'node:fs/promises';
import openapiTS, { astToString } from 'openapi-typescript';
import schemas from '../server/src/providers/ai/schemas.json' with { type: 'json' };

const generatedTypes = astToString(
  await openapiTS(
    JSON.stringify({
      openapi: '3.1.0',
      info: { title: 'AI provider outputs', version: '1' },
      paths: {},
      components: {
        schemas: {
          Extraction: schemas.$defs.extraction,
          Selection: schemas.$defs.selection,
          Mapping: schemas.$defs.mapping,
          Discovery: schemas.$defs.discovery,
          DocumentExtraction: schemas.$defs.documentExtraction,
          ...Object.fromEntries(
            [...schemas.registryTools, ...schemas.chatTools].map((tool) => [
              tool.name,
              tool.parameters,
            ]),
          ),
        },
      },
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
