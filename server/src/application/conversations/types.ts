/**
 * Defines the provider boundary for assistant input, tool results, attachment content and streamed
 * text updates.
 */

import type { Schema } from '../../../../shared/model.js';
import type { AiContext, Source } from '../import/types.js';
import type { PublicField } from '../public-fields.js';

export interface ResearchAnswer {
  text: string;
  sources: string[];
}

export interface ChatToolResult {
  output: unknown;
  source?: Source;
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
}

export interface ChatAi {
  research(question: string, fields: PublicField[], context: AiContext): Promise<ResearchAnswer>;
  respond(
    input: ChatInput,
    execute: (name: string, args: unknown) => Promise<ChatToolResult>,
    context: ChatContext,
  ): Promise<string>;
}
