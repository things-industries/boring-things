/** Assembles streamed assistant and public research tasks behind the chat capability contract. */

import type { EnvConfig } from '../../config.js';
import type { ChatAi } from '../../application/conversations/types.js';
import type { AiTurnCompleted } from './types.js';
import { AssistantTask } from './tasks/assistant.js';
import { ResearchTask } from './tasks/research.js';

export class OpenAiChat implements ChatAi {
  constructor(
    private config: EnvConfig,
    private onTurnCompleted?: AiTurnCompleted,
  ) {}

  research: ChatAi['research'] = (question, fields, context) =>
    new ResearchTask(this.config, question, fields, this.config.discoverySearchCalls)
      .onTurnCompleted(this.onTurnCompleted)
      .run(context);
  respond: ChatAi['respond'] = (input, tools, context) =>
    new AssistantTask(this.config, input, tools, this.config.chatToolCalls)
      .onTurnCompleted(this.onTurnCompleted)
      .run(context);
}
