/** Assembles streamed assistant and public research tasks behind the chat capability contract. */

import type { ChatAi } from '../../application/conversations/types.js';
import type { AiTurnCompleted } from './types.js';
import { AssistantTask } from './tasks/assistant.js';
import { AssistantResearchTask } from './tasks/assistant-research.js';

export class OpenAiChat implements ChatAi {
  constructor(private onTurnCompleted?: AiTurnCompleted) {}

  research: ChatAi['research'] = (question, fields, context) =>
    new AssistantResearchTask(question, fields, context)
      .onTurnCompleted(this.onTurnCompleted)
      .run();
  respond: ChatAi['respond'] = (input, tools, context) =>
    new AssistantTask(input, tools, context).onTurnCompleted(this.onTurnCompleted).run();
}
