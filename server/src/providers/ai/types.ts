/** Defines job execution resources and completion telemetry shared by AI tasks and application callers. */

import type { Schema } from '../../../../shared/model.js';
import type { Database } from '../../db/connection.js';
import type { Registry } from '../../application/registry/registry.js';

export interface RegistryResources {
  db: Database;
  registry: Registry;
}

export interface AiContext {
  // Cancels model requests and other work belonging to the job.
  signal: AbortSignal;

  // Distinguishes job deadlines from shutdown when a request is aborted.
  cancellationReason?: () => 'deadline' | 'shutdown';

  // When supplied, the local tool count and limit exclude hosted searches.
  toolCalls?: number;
  toolCallLimit?: number;

  // Consumes the job's shared model-request allowance, including usage from earlier attempts.
  beforeRequest?: () => void;

  // Awaits job-specific usage persistence; completion telemetry uses onTurnCompleted separately.
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
