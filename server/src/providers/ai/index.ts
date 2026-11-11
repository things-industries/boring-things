/**
 * Assembles AI adapters and validates credentials before starting application work.
 */

import { getEnv } from '../../config.js';
import { ScheduleTask } from './tasks/schedule-task.js';
import type { TaskScheduler } from '../../application/task-scheduling.js';
import type { ImportAi } from '../../application/import/types.js';
import type { ChatAi } from '../../application/conversations/types.js';
import { OpenAiImports } from './openai-imports.js';
import { OpenAiChat } from './openai-chat.js';
import type { AiTurnCompleted, RegistryResources } from './types.js';

interface AiProviders {
  taskScheduler?: TaskScheduler;
  importAi?: ImportAi;
  chatAi?: ChatAi;
}

export function createAi(
  overrides: AiProviders = {},
  onTurnCompleted?: AiTurnCompleted,
  registryResources?: RegistryResources,
): Required<AiProviders> {
  if (!overrides.importAi || !overrides.chatAi) getEnv('OPENAI_API_KEY');
  return {
    taskScheduler: overrides.taskScheduler ?? {
      schedule: (task, thing, history, today) =>
        new ScheduleTask(
          { task, thing, history, today },
          { signal: AbortSignal.timeout(60000), record: async () => {} },
        )
          .onTurnCompleted(onTurnCompleted)
          .run(),
    },
    importAi:
      overrides.importAi ?? new OpenAiImports(onTurnCompleted, undefined, registryResources),
    chatAi: overrides.chatAi ?? new OpenAiChat(onTurnCompleted),
  };
}
