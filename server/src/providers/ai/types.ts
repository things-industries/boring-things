/** Defines execution context and usage reporting shared by AI providers and their application callers. */

import type { Schema } from '../../../../shared/model.js';

import type { Database } from '../../db/connection.js';
import type { Registry } from '../../application/registry/registry.js';

export interface RegistryResources {
  db: Database;
  registry: Registry;
}

export interface AiContext {
  signal: AbortSignal;
  beforeRequest?: () => void;
  maxTextCharacters?: number;
  record(usage: Partial<Schema['ImportUsage']>): Promise<void>;
}

export interface AiTurnMetrics {
  tokens: [input: number, output: number];
  elapsedMs: number;
  [name: string]: number | [number, number];
}

export type AiTurnCompleted = (turn: {
  task: string;
  model: string;
  toolCalls: string[];
  metrics: AiTurnMetrics;
}) => void;
