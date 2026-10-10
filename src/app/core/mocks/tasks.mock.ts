// Mock for #100: Tasks, Thing dates and completion actions. Remove when #100 is delivered.
import type { Schema } from '../../../../shared/model';
import type {
  Appointment,
  CompletionAction,
  Task,
  TaskPriority,
  TaskRecurrence,
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

const renewal = /renew|expires|expiry/i;

/**
 * Completion actions inferred from the text. A visit about an issue asks whether it is fixed or
 * needs a follow-up, a garage visit asks for the invoice or more work, and a certificate or renewal
 * asks for the new document. `mockDeadline` adds the new date to renewals.
 */
function completionActions(event: Schema['Event']): CompletionAction[] {
  const text = `${event.title} ${event.description}`;

  if (/mechanic|garage/i.test(text))
    return [
      { type: 'ADD_DOCUMENT', label: 'Add the invoice', documentType: 'INVOICE' },
      { type: 'CHAT', label: 'Needs more work', prompt: 'The mechanic found more work: ' },
    ];
  if (/certificate|gas safety|\bmot\b/i.test(text))
    return [{ type: 'ADD_DOCUMENT', label: 'Add the new certificate', documentType: 'OTHER' }];
  if (/visit|engineer|technician|repair|install|appointment|cleaner/i.test(text))
    return event.issueId
      ? [
          { type: 'RESOLVE_ISSUE', label: 'Is it fixed?' },
          { type: 'CHAT', label: 'Needs a follow-up', prompt: 'It still needs work: ' },
        ]
      : [{ type: 'CHAT', label: 'How did it go?', prompt: '' }];
  if (renewal.test(text))
    return [{ type: 'ADD_DOCUMENT', label: 'Add the renewal', documentType: 'OTHER' }];
  return [];
}

/**
 * The Task for a date-only Event, or `null` for a dismissed one. Priority and completion actions
 * are inferred from the text; `intervals` holds recurrences changed this session. Read
 * recurrences count from completion.
 */
export function mockTask(
  event: Schema['Event'],
  intervals: Record<string, TaskRecurrence | null>,
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
    recurrence:
      event.id in intervals
        ? intervals[event.id]
        : recurrence && { ...recurrence, from: 'COMPLETION' },
    completionActions: completionActions(event),
    completedAt: event.completedAt,
    sourceRefs: event.sourceRefs,
    isSample: event.isSample,
  };
}

/** A timed Event with completion actions inferred from its text; no end time. */
export function mockAppointment(event: Schema['Event']): Appointment {
  return { ...event, endsAt: null, completionActions: completionActions(event) };
}

const deadlineName = /\b(ends?|expires?|expiry|renewal|renews)\b/i;

/** A deadline field on a Thing, set or not. */
export type MockDeadlineField = Omit<ThingDate, 'date'> & { date: string | null };

/** DATE fields in loaded Thing details whose names mention an end, expiry or renewal. */
export function mockDeadlineFields(things: ThingRecord[]): MockDeadlineField[] {
  return things.flatMap((thing) => {
    const detail = thing.detail;

    if (!detail) return [];

    const fields = [...detail.fieldSets.flatMap((set) => set.fields), ...detail.standaloneFields];

    return fields.flatMap((field) =>
      field.uiHint === 'DATE' && deadlineName.test(field.name)
        ? [
            {
              thingId: thing.id,
              fieldId: field.id,
              label: field.name,
              date: typeof field.value === 'string' ? field.value : null,
            },
          ]
        : [],
    );
  });
}

/** Thing deadlines: the deadline fields that are set. */
export function mockThingDates(fields: MockDeadlineField[]): ThingDate[] {
  return fields.flatMap(({ date, ...field }) => (date ? [{ ...field, date }] : []));
}

/**
 * A renewal or expiry task takes its deadline from the Thing's earliest deadline date on or after
 * the task's day. Once done, it asks for that field's new date, or the Thing's first deadline
 * field's when none is set.
 */
export function mockDeadline(task: Task, fields: MockDeadlineField[]): Task {
  if (!task.scheduledOn || !renewal.test(task.title)) return task;

  const scheduledOn = task.scheduledOn;
  const own = fields.filter((field) => field.thingId === task.thingId);
  const dated = mockThingDates(own)
    .filter((date) => date.date >= scheduledOn)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const field = dated ?? own[0];

  if (!field) return task;
  return {
    ...task,
    deadlineOn: dated?.date ?? task.deadlineOn,
    completionActions: [
      { type: 'UPDATE_FIELD', label: 'Set the new date', fieldId: field.fieldId },
      ...task.completionActions,
    ],
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
 * event with a completion action, Ask and `CHAT` actions start a new Thing chat with the item, its
 * issue and the action's prompt in the composer.
 */
export function mockChatDraft(
  title: string,
  issueTitle: string | null,
  action: Extract<CompletionAction, { type: 'CHAT' }> | null,
): string {
  const about = issueTitle ? `“${title}” about “${issueTitle}”` : `“${title}”`;

  return action ? `Update on ${about}: ${action.prompt}` : `About ${about}: `;
}
