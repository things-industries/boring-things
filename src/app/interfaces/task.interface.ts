import type { Schema } from '../../../shared/model';
import type { EventKind, EventRecurrence } from './event.interface';

export type TaskStatus = 'SUGGESTED' | 'SCHEDULED' | 'COMPLETED';

/** How often a task repeats, and whether the next one counts from completion or the due date. */
export type TaskRecurrence = EventRecurrence & { from: 'COMPLETION' | 'DUE_DATE' };

/** How bad it is if the task is not done, most important first. */
export type TaskPriority = 'CRITICAL' | 'IMPORTANT' | 'RECOMMENDED' | 'NICE_TO_HAVE';

/**
 * An option offered once a task or event is done. An item's options show side by side as
 * alternatives, such as "Is it fixed?" and "Needs a follow-up" after an engineer's visit. `label` is
 * the button text and the title of the dialog it opens.
 * - `CHAT` opens a Thing chat with the item, its issue and this action as context; `prompt` is the
 *   opening message.
 * - `UPDATE_FIELD` asks for a new value of the Thing field `fieldId`.
 * - `ADD_DOCUMENT` uploads a document of `documentType` linked to the Thing.
 * - `RESOLVE_ISSUE` resolves the item's `issueId`.
 */
export type CompletionAction = { label: string } & (
  | { type: 'CHAT'; prompt: string }
  | { type: 'UPDATE_FIELD'; fieldId: string }
  | { type: 'ADD_DOCUMENT'; documentType: Schema['AttachmentDocumentTypeEnum'] }
  | { type: 'RESOLVE_ISSUE' }
);

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
  recurrence: TaskRecurrence | null;
  completionActions: CompletionAction[];
  completedAt: string | null;
  sourceRefs: Schema['SourceRef'][];
  isSample: boolean;
}

/** An Event with the #100 additions. */
export type Appointment = Schema['Event'] & {
  endsAt: string | null;
  completionActions: CompletionAction[];
};

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
