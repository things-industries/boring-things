import schemas from '../providers/ai/schemas.js';
import type { components } from '../providers/ai/schema-types.js';

export type ChatToolInputs = components['schemas'];

export const chatFunctions = schemas.chatTools.map((tool) => ({
  ...tool,
  type: 'function' as const,
}));
