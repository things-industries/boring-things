/** API task types and the timeline's combined view of work, appointments and Thing dates. */

import type { Schema } from '../../../shared/model';

export type Task = Schema['Task'];
export type TaskStatus = Task['status'];
export type TaskRecurrence = Schema['TaskRecurrence'];
export type TaskInterval = Pick<TaskRecurrence, 'interval' | 'unit'>;
export type TaskImportance = Schema['TaskImportanceEnum'];
export type CompletionAction = Schema['CompletionAction'];
export type Appointment = Schema['Event'];
export type ThingDate = Schema['ThingDate'];

interface AgendaEntry {
  key: string;
  thingId: string;
  day: string;
  overdue: boolean;
}
export type AgendaItem =
  | (AgendaEntry & { type: 'TASK'; task: Task })
  | (AgendaEntry & { type: 'EVENT'; event: Appointment })
  | (AgendaEntry & { type: 'THING_DATE'; thingDate: ThingDate; thingName: string });
export interface AgendaDay {
  date: string;
  items: AgendaItem[];
}
export interface Agenda {
  today: AgendaItem[];
  tomorrow: AgendaItem[];
  upcoming: AgendaDay[];
  followups: AgendaItem[];
}
