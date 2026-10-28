/**
 * Defines the provider boundary for assistant input, tool results, attachment content and streamed
 * text updates.
 */

import type { Schema } from '../../../../shared/model.js';
import type { Source } from '../import/types.js';
import type { AiContext } from '../../providers/ai/types.js';
import type { PublicField } from '../public-fields.js';
import type { chatThingContext } from './context.js';

export interface ChatToolInputs {
  search_things: { query: string };
  read_thing: { thingId: string };
  read_attachment: { attachmentId: string; includeImages: boolean | null };
  research: { thingId: string; question: string };
  create_event: { thingId: string; title: string; description: string };
  create_issue: ChatToolInputs['create_event'];
  show_cards: {
    cards: {
      type: Schema['ResourceCard']['type'];
      id: string;
      fieldSetId: string | null;
      fieldId: string | null;
      customFieldId: string | null;
      page: number | null;
    }[];
  };
}

export type ChatToolCall = {
  [Name in keyof ChatToolInputs]: { name: Name; args: ChatToolInputs[Name] };
}[keyof ChatToolInputs];

export interface ChatTools {
  execute<Name extends keyof ChatToolInputs>(
    name: Name,
    args: ChatToolInputs[Name],
  ): Promise<ChatToolResult>;
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
