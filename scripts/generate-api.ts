import { checkContract } from '../server/src/contracts/check.js';
import { readFile, writeFile } from 'node:fs/promises';
import openapiTS, { astToString } from 'openapi-typescript';
import SwaggerParser from '@apidevtools/swagger-parser';
import ts from 'typescript';

checkContract();
await SwaggerParser.validate('openapi.json');
const output = astToString(
  await openapiTS(new URL('../openapi.json', import.meta.url), {
    transform(schema) {
      if (schema.format === 'binary') return ts.factory.createTypeReferenceNode('Blob');
    },
  }),
);
const path = new URL('../shared/api.ts', import.meta.url);
if (process.argv.includes('--check')) {
  if ((await readFile(path, 'utf8')) !== output)
    throw new Error('Generated contracts are stale. Run pnpm api:generate.');
} else {
  await writeFile(path, output);
}
