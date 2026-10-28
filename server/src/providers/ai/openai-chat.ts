/** Assembles streamed assistant and public research tasks behind the chat capability contract. */

import OpenAI from 'openai';
import type { ChatAi } from '../../application/conversations/types.js';
import type { AiTurnCompleted } from './types.js';
import type { TaskRuntime } from './tasks/task.js';
import { AssistantTask } from './tasks/assistant.js';
import { ResearchTask } from './tasks/research.js';

export class OpenAiChat implements ChatAi {
  private runtime: TaskRuntime;
  constructor(
    key: string,
    model: string,
    maxOutputTokens: number,
    private rounds: number,
    private searchCalls = 3,
    onTurnCompleted?: AiTurnCompleted,
  ) {
    this.runtime = {
      client: new OpenAI({ apiKey: key, maxRetries: 0 }),
      model,
      maxOutputTokens,
      onTurnCompleted,
    };
  }

  research: ChatAi['research'] = (question, fields, context) =>
    new ResearchTask(this.runtime, question, fields, this.searchCalls).run(context);
  respond: ChatAi['respond'] = (input, tools, context) =>
    new AssistantTask(this.runtime, input, tools, this.rounds).run(context);
}
