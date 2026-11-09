/** Loads shared AI prompt content from Markdown files. */

import { readFileSync } from 'node:fs';

// Reads a named Markdown prompt relative to this module.
export const getPrompt = (name: string) =>
  readFileSync(new URL(`./prompt-content/${name}.md`, import.meta.url), 'utf8').trim() + '\n\n';
