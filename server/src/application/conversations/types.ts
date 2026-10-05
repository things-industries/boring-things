/**
 * Defines the provider boundary for assistant input, tool results, attachment content and streamed
 * text updates.
 */

import type { Schema } from '../../../../shared/model.js';
import type { AiContext, Source } from '../import/types.js';
import type { PublicField } from '../public-fields.js';
import type { chatThingContext } from './context.js';

export interface ChatTools {
  definitions: readonly {
    type: 'function';
    name: string;
    description: string;
    parameters: object;
    strict: boolean;
  }[];
  execute(name: string, args: unknown): Promise<ChatToolResult>;
}

export interface ChatFailure {
  conversationId: string;
  messageId: string;
  kind: string;
  message: string;
}

export interface ResearchAnswer {
  text: string;
  sources: string[];
}

export interface ChatToolResult {
  output: unknown;
  source?: Source & { includeImages?: boolean };
}

export interface ChatContext extends AiContext {
  delta(text: string): void;
}

export interface ChatMessage {
  role: Schema['MessageRoleEnum'];
  content: string;
}

export interface ChatInput {
  messages: ChatMessage[];
  thingId: string | null;
  completedWrites: unknown[];
  activeThing?: ReturnType<typeof chatThingContext>;
}

export interface ChatAi {
  research(question: string, fields: PublicField[], context: AiContext): Promise<ResearchAnswer>;
  respond(input: ChatInput, tools: ChatTools, context: ChatContext): Promise<string>;
}
