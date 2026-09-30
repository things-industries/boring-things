/**
 * Defines the provider boundary for assistant input, tool results, attachment content and streamed
 * text updates.
 */

import type { Schema } from '../../../../shared/model.js';
import type { AiContext, Source } from '../import/types.js';

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
  respond(
    input: ChatInput,
    execute: (name: string, args: unknown) => Promise<ChatToolResult>,
    context: ChatContext,
  ): Promise<string>;
}
