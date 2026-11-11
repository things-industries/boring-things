/**
 * Conversation activity context and provider contracts for assistant tools, attachment content
 * and streamed text updates.
 */

import type { Schema } from '../../../../shared/model.js';
import type { Source } from '../import/types.js';
import type { AiContext } from '../../providers/ai/types.js';
import type { PublicField } from '../public-fields.js';
import type { ChatInput } from '../../providers/ai/tasks/assistant.js';
import type { ChatFieldInput } from './fields.js';
import type { FieldSearchLabel } from '../registry/registry.js';

export interface ActivityContext {
  item: Schema['Task'] | Schema['Event'];
  issue: Schema['Issue'] | null;
  followup: boolean;
  timeZone?: string;
}

export interface ChatToolInputs {
  search_things: { query: string };
  read_thing: { thingId: string };
  read_attachment: { attachmentId: string; includeImages: boolean | null };
  research: { thingId: string; question: string };
  search_field_sets: { categoryId: string; terms: string[] };
  search_fields: { labels: FieldSearchLabel[] };
  update_thing_fields: ChatFieldInput;
  create_task: Required<Omit<Schema['TaskInput'], 'id' | 'status'>>;
  create_event: Required<Omit<Schema['EventInput'], 'id' | 'status'>>;
  create_issue: { thingId: string; title: string; description: string };
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

export interface ChatAi {
  research(question: string, fields: PublicField[], context: AiContext): Promise<ResearchAnswer>;
  respond(input: ChatInput, tools: ChatTools, context: ChatContext): Promise<string>;
}

export interface ResearchAnswer {
  text: string;
  sources: string[];
}
