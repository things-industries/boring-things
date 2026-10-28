/** Defines execution context and usage reporting shared by AI providers and their application callers. */

import type { Schema } from '../../../../shared/model.js';

export interface AiContext {
  signal: AbortSignal;
  beforeRequest?: () => void;
  maxTextCharacters?: number;
  record(usage: Partial<Schema['ImportUsage']>): Promise<void>;
}

export type AiTurnCompleted = (usage: Schema['AiUsageEntry'] & { toolCalls: string[] }) => void;
