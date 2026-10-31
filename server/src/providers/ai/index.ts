/**
 * Selects configured AI adapters. Missing credentials leave imports and chat unavailable.
 */

import type { EnvConfig } from '../../config.js';
import type { ImportAi } from '../../application/import/types.js';
import type { ChatAi } from '../../application/conversations/types.js';
import { OpenAiImports } from './openai-imports.js';
import { OpenAiChat } from './openai-chat.js';
import type { AiTurnCompleted } from './types.js';

interface AiProviders {
  importAi?: ImportAi;
  chatAi?: ChatAi;
}

export function createAi(
  config: EnvConfig,
  overrides: AiProviders = {},
  onTurnCompleted?: AiTurnCompleted,
): AiProviders {
  const enabled = !!config.openaiApiKey;
  return {
    importAi:
      overrides.importAi ?? (enabled ? new OpenAiImports(config, onTurnCompleted) : undefined),
    chatAi: overrides.chatAi ?? (enabled ? new OpenAiChat(config, onTurnCompleted) : undefined),
  };
}
