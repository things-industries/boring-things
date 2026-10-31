/** Transcription tool, reads bounded passages from authorised source data and records usage. */

import type { FunctionTool } from 'openai/resources/responses/responses';
import type { ImportTaskContext } from '../../../application/import/types.js';
import type { components } from '../schema-types.js';
import { createObjectSchema } from '../schemas.js';
import { createTool, recordToolCall } from './tool.js';
import { ensure } from '../../../application/errors.js';

export const search_transcription = {
  type: 'function',
  name: 'search_transcription',
  description: 'Search supplied Attachment transcriptions for bounded cited passages.',
  strict: true,
  parameters: createObjectSchema(
    {
      attachmentId: {
        description: 'Supplied Attachment ID.',
        type: 'string',
      },
      query: {
        description: 'Search phrase, or empty text for the beginning.',
        type: 'string',
      },
      offset: {
        description: 'Character offset for reading the next source section.',
        type: 'integer',
        minimum: 0,
      },
    },
    'Source search arguments.',
  ),
} satisfies FunctionTool;

// Reads a bounded passage from the task's authorised source data.
export async function searchTranscription(
  context: ImportTaskContext,
  id: string,
  query: string,
  offset: number,
) {
  const source = context.sources.find((source) => source.attachmentId === id);
  ensure(
    source && query.length <= 200 && Number.isInteger(offset) && offset >= 0,
    'Invalid source search',
  );
  const text = source.text;
  const found = query ? text.toLowerCase().indexOf(query.toLowerCase(), offset) : offset;
  const start = Math.max(0, (found < 0 ? offset : found) - 200);
  const content = text.slice(start, start + 6000);
  await recordToolCall(
    context,
    'search_transcription',
    content ? 1 : 0,
    start + 6000 < text.length,
  );
  return {
    attachmentId: id,
    text: content,
    offset: start,
    nextOffset: start + 6000 < text.length ? start + 6000 : null,
  };
}

// Gives the model a validated transcription search tool for this task's source scope.
export function createTranscriptionTool(context: ImportTaskContext) {
  return createTool<components['schemas']['search_transcription']>(
    search_transcription,
    async (args) => ({
      output: await searchTranscription(context, args.attachmentId, args.query, args.offset),
    }),
  );
}
