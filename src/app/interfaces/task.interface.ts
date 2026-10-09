import type { Schema } from '../../../shared/model';
import type { EventKind, EventRecurrence } from './event.interface';

export type TaskStatus = 'SUGGESTED' | 'SCHEDULED' | 'COMPLETED';

/** How bad it is if the task is not done, most important first. */
export type TaskPriority = 'CRITICAL' | 'IMPORTANT' | 'RECOMMENDED' | 'NICE_TO_HAVE';

/** What the owner is asked once a task or event is done. */
export type FollowUp =
  | { type: 'CHAT'; prompt: string }
  | { type: 'UPDATE_FIELD'; prompt: string; fieldId: string }
  | { type: 'ADD_DOCUMENT'; prompt: string; documentType: Schema['AttachmentDocumentTypeEnum'] };

/** Something the owner does for a Thing, shaped like the #100 `Task`. */
export interface Task {
  id: string;
  thingId: string;
  issueId: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  kind: EventKind;
  /** Day the task sits in the list; null while suggested. */
  scheduledOn: string | null;
  deadlineOn: string | null;
  recurrence: EventRecurrence | null;
  followUp: FollowUp | null;
  completedAt: string | null;
  sourceRefs: Schema['SourceRef'][];
  isSample: boolean;
}

/** An Event with the #100 additions. */
export type Appointment = Schema['Event'] & { endsAt: string | null; followUp: FollowUp | null };

/** A deadline read from a DATE field on a Thing, such as a warranty end. */
export interface ThingDate {
  thingId: string;
  fieldId: string;
  label: string;
  date: string;
}

interface AgendaEntry {
  /** Unique across item types. */
  key: string;
  thingId: string;
  /** Local calendar date the item sits on, `yyyy-MM-dd`; overdue items sit on today. */
  day: string;
  overdue: boolean;
}

export type AgendaItem =
  | (AgendaEntry & { type: 'TASK'; task: Task })
  | (AgendaEntry & { type: 'EVENT'; event: Appointment })
  | (AgendaEntry & { type: 'THING_DATE'; thingDate: ThingDate; thingName: string });

export interface AgendaDay {
  /** Local calendar date, `yyyy-MM-dd`. */
  date: string;
  items: AgendaItem[];
}

export interface Agenda {
  today: AgendaItem[];
  tomorrow: AgendaItem[];
  upcoming: AgendaDay[];
}
