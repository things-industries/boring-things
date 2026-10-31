/** Defines execution context and usage reporting shared by AI providers and their application callers. */

import type { Schema } from '../../../../shared/model.js';
import type { EnvConfig } from '../../config.js';

import type { Database } from '../../db/connection.js';
import type { Registry } from '../../application/registry/registry.js';

export interface RegistryResources {
  db: Database;
  registry: Registry;
}

export type AiConfig = Pick<
  EnvConfig,
  'openaiApiKey' | 'aiMaxOutputTokens' | 'importMaxTextCharacters'
>;

export interface AiContext {
  signal: AbortSignal;
  beforeRequest?: () => void;
  maxTextCharacters?: number;
  record(usage: Partial<Schema['ImportUsage']>): Promise<void>;
}

export type AiTurnCompleted = (usage: Schema['AiUsageEntry'] & { toolCalls: string[] }) => void;
