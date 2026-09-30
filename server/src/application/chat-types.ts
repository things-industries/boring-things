import type { Schema } from '../../../shared/model.js';
import type { AiContext, Source } from './import-types.js';
export interface ChatToolResult {
  output: unknown;
  source?: Source;
}
export interface ChatContext extends AiContext {
  delta(text: string): void;
}
export interface ChatInput {
  messages: { role: 'user' | 'assistant'; content: string }[];
  thingId: string | null;
  intent: Schema['MessageInput']['intent'];
  completedWrites: unknown[];
}
export interface ChatAi {
  respond(
    input: ChatInput,
    execute: (name: string, args: unknown) => Promise<ChatToolResult>,
    context: ChatContext,
  ): Promise<string>;
}
