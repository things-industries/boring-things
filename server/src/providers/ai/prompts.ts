/** Loads shared Thing definitions and evidence rules from Markdown files. */

import { readFileSync } from 'node:fs';

export const thingDefinition = readFileSync(
  new URL('./prompt-content/thing-definition.md', import.meta.url),
  'utf8',
).trim();

export const webResearchInstructions = readFileSync(
  new URL('./prompt-content/web-research-instructions.md', import.meta.url),
  'utf8',
).trim();

export const importInstructions = readFileSync(
  new URL('./prompt-content/import-instructions.md', import.meta.url),
  'utf8',
).trim();
