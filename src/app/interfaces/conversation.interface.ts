import type { Schema } from '../../../shared/model';

export type ConversationStreamEvent =
  | { type: 'snapshot'; conversation: Schema['Conversation'] }
  | { type: 'delta'; delta: Schema['ConversationDelta'] };
