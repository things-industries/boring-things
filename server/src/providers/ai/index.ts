/**
 * Assembles AI adapters and validates credentials before starting application work.
 */

import type { EnvConfig } from '../../config.js';
import type { ImportAi } from '../../application/import/types.js';
import type { ChatAi } from '../../application/conversations/types.js';
import { OpenAiImports } from './openai-imports.js';
import { OpenAiChat } from './openai-chat.js';
import type { AiTurnCompleted, RegistryResources } from './types.js';
import { getEnv } from '../../env.js';

interface AiProviders {
  importAi?: ImportAi;
  chatAi?: ChatAi;
}

export function createAi(
  config: EnvConfig,
  overrides: AiProviders = {},
  onTurnCompleted?: AiTurnCompleted,
  registryResources?: RegistryResources,
): Required<AiProviders> {
  if (!overrides.importAi || !overrides.chatAi) getEnv('OPENAI_API_KEY');
  return {
    importAi:
      overrides.importAi ?? new OpenAiImports(onTurnCompleted, undefined, registryResources),
    chatAi: overrides.chatAi ?? new OpenAiChat(config, onTurnCompleted),
  };
}
