import type { Schema } from '../../../shared/model';

export type EventView = Schema['Event'] & { thingName: string };
