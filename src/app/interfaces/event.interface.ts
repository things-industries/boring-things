import type { Schema } from '../../../shared/model';

export type EventView = Schema['Event'] & { thingName: string };

export type EventKind = 'CLEANING' | 'INSPECTION' | 'REPAIR' | 'REPLACEMENT' | 'SERVICE' | 'OTHER';

export interface EventRecurrence {
  interval: number;
  unit: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
}

/** A Thing task with its kind and recurrence. */
export type TaskView = Schema['Event'] & { kind: EventKind; recurrence: EventRecurrence | null };
