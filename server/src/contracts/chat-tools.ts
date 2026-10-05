import schemas from '../providers/ai/schemas.js';

export const chatFunctions = schemas.chatTools.map((tool) => ({
  ...tool,
  type: 'function' as const,
}));
