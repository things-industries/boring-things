/** Binds model function definitions to validated arguments and awaited application capabilities. */

import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';
import type { FunctionTool, ResponseInput } from 'openai/resources/responses/responses';
import { ensure } from '../../../application/errors.js';

const ajv = new Ajv({ strict: false });
addFormats.default(ajv);

export interface TaskToolResult {
  output: unknown;
  input?: ResponseInput;
}

export interface TaskTool {
  definition: FunctionTool;
  execute(args: unknown): Promise<TaskToolResult>;
}

// Checks function arguments before calling the typed handler.
export function createTool<T>(
  definition: FunctionTool,
  execute: (args: T) => Promise<TaskToolResult>,
): TaskTool {
  ensure(definition.parameters, 'Missing AI tool schema');
  const valid = ajv.compile<T>(definition.parameters);
  return {
    definition,
    async execute(args) {
      ensure(valid(args), 'Invalid AI tool arguments');
      return execute(args);
    },
  };
}
