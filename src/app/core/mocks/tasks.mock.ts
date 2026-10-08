// Mock for #100: Tasks, Thing dates and follow-ups. Remove when #100 is delivered.
import type { Schema } from '../../../../shared/model';
import type { EventRecurrence } from '../../interfaces/event.interface';
import type {
  Appointment,
  FollowUp,
  Task,
  TaskPriority,
  TaskStatus,
  ThingDate,
} from '../../interfaces/task.interface';
import type { ThingRecord } from '../../interfaces/thing.interface';
import { mockEventRecurrence } from './event-recurrence.mock';

const statuses: Partial<Record<Schema['EventStatusEnum'], TaskStatus>> = {
  SUGGESTED: 'SUGGESTED',
  SCHEDULED: 'SCHEDULED',
  COMPLETED: 'COMPLETED',
};

/** Until #100, a Task is an Event without a time; a timed Event is an appointment. */
export const isTaskEvent = (event: Schema['Event']) => !event.startsAt;

function priority(text: string): TaskPriority {
  if (/visa|passport|insurance|mot\b|gas safety|smoke|carbon monoxide/i.test(text))
    return 'CRITICAL';
  if (/renew|expires|expiry|licence|license|permit|tax|service|inspect/i.test(text))
    return 'IMPORTANT';
  if (/oil|polish|window|tidy|declutter/i.test(text)) return 'NICE_TO_HAVE';
  return 'RECOMMENDED';
}

function taskFollowUp(text: string): FollowUp | null {
  return /certificate|gas safety|\bmot\b/i.test(text)
    ? { type: 'ADD_DOCUMENT', prompt: 'Add the new certificate', documentType: 'OTHER' }
    : null;
}

/**
 * The Task for a date-only Event, or `null` for a dismissed one. Priority and an `ADD_DOCUMENT`
 * follow-up are inferred from the text; `intervals` holds recurrences changed this session.
 */
export function mockTask(
  event: Schema['Event'],
  intervals: Record<string, EventRecurrence | null>,
): Task | null {
  const status = statuses[event.status];

  if (!status) return null;

  const { kind, recurrence } = mockEventRecurrence(event);
  const text = `${event.title} ${event.description}`;

  return {
    id: event.id,
    thingId: event.thingId,
    issueId: event.issueId,
    title: event.title,
    description: event.description,
    status,
    priority: priority(text),
    kind,
    scheduledOn: event.startsOn,
    deadlineOn: null,
    recurrence: event.id in intervals ? intervals[event.id] : recurrence,
    followUp: taskFollowUp(text),
    completedAt: event.completedAt,
    sourceRefs: event.sourceRefs,
    isSample: event.isSample,
  };
}

/** A timed Event with a chat follow-up when it reads like a visit; no end time. */
export function mockAppointment(event: Schema['Event']): Appointment {
  const visit = /visit|engineer|technician|repair|install|appointment|cleaner/i.test(
    `${event.title} ${event.description}`,
  );

  return {
    ...event,
    endsAt: null,
    followUp: visit ? { type: 'CHAT', prompt: 'How did it go?' } : null,
  };
}

const deadlineName = /\b(ends?|expires?|expiry|renewal|renews)\b/i;

/** Deadlines from loaded Thing details: DATE fields whose names mention an end, expiry or renewal. */
export function mockThingDates(things: ThingRecord[]): ThingDate[] {
  return things.flatMap((thing) => {
    const detail = thing.detail;

    if (!detail) return [];

    const fields = [...detail.fieldSets.flatMap((set) => set.fields), ...detail.standaloneFields];

    return fields.flatMap((field) =>
      field.uiHint === 'DATE' && typeof field.value === 'string' && deadlineName.test(field.name)
        ? [{ thingId: thing.id, fieldId: field.id, label: field.name, date: field.value }]
        : [],
    );
  });
}

/**
 * A renewal or expiry task takes its deadline from the Thing's earliest deadline date on or after
 * the task's day, and asks for the new date once done.
 */
export function mockDeadline(task: Task, dates: ThingDate[]): Task {
  if (!task.scheduledOn || !/renew|expires|expiry/i.test(task.title)) return task;

  const scheduledOn = task.scheduledOn;
  const date = dates
    .filter((d) => d.thingId === task.thingId && d.date >= scheduledOn)
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  if (!date) return task;
  return {
    ...task,
    deadlineOn: date.date,
    followUp: task.followUp ?? {
      type: 'UPDATE_FIELD',
      prompt: `What is the new ${date.label.toLowerCase()}?`,
      fieldId: date.fieldId,
    },
  };
}

/** Thing dates need field values, so every Thing's details load once its summary has. */
export async function mockLoadThingDetails(things: {
  ensureLoaded(): Promise<void>;
  entities(): ThingRecord[];
  loadOne(id: string): Promise<unknown>;
}) {
  await things.ensureLoaded();
  await Promise.all(
    things
      .entities()
      .filter((thing) => !thing.detail)
      .map((thing) => things.loadOne(thing.id)),
  );
}

/**
 * Opening message for a chat about an agenda item. Until `ConversationInput` accepts a task or
 * event, Ask and chat follow-ups start a new Thing chat with this text in the composer.
 */
export function mockChatDraft(title: string, followUp: boolean): string {
  return followUp ? `Update on “${title}”: ` : `About “${title}”: `;
}
