import { readFile, writeFile } from 'node:fs/promises';
import openapiTS, { astToString } from 'openapi-typescript';
import SwaggerParser from '@apidevtools/swagger-parser';

await SwaggerParser.validate('openapi.json');
const output = astToString(await openapiTS(new URL('../openapi.json', import.meta.url)));
const path = new URL('../shared/api.ts', import.meta.url);
if (process.argv.includes('--check')) {
  if ((await readFile(path, 'utf8')) !== output)
    throw new Error('Generated contracts are stale. Run pnpm api:generate.');
} else {
  await writeFile(path, output);
}
