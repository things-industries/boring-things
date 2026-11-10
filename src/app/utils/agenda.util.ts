/** Timeline placement, ordering and followup eligibility for Tasks, Events and Thing dates. */

import { addDays, parseISO } from 'date-fns';
import type { TaskInterval } from '../interfaces/task.interface';
import type {
  Agenda,
  AgendaDay,
  AgendaItem,
  Appointment,
  Task,
  TaskImportance,
  ThingDate,
} from '../interfaces/task.interface';
import { dayKey, daysUntil } from './date.util';

export const importanceRank: Record<TaskImportance, number> = {
  CRITICAL: 0,
  IMPORTANT: 1,
  RECOMMENDED: 2,
  NICE_TO_HAVE: 3,
};
export interface AgendaInput {
  tasks: Task[];
  events: Appointment[];
  thingDates: ThingDate[];
  thingNames: Record<string, string>;
}

/** Whether a Task's deadline has passed; checking it off keeps it overdue, so it keeps its place. */
export function isOverdue(task: Task, today: string) {
  return !!task.deadlineOn && task.deadlineOn < today;
}

/** Whether an appointment has ended, without changing its stored status. */
export function hasEventEnded(event: Appointment, now = new Date()) {
  return event.startsAt
    ? parseISO(event.endsAt ?? event.startsAt) <= now
    : !!event.startsOn && event.startsOn < dayKey(now);
}

/** Whether a Task is completed or an Event has ended. */
export function isDone(item: AgendaItem, now = new Date()) {
  return item.type === 'TASK'
    ? !!item.task.completedAt
    : item.type === 'EVENT' && hasEventEnded(item.event, now);
}

/** The item's own title. */
export function itemTitle(item: AgendaItem) {
  return item.type === 'TASK'
    ? item.task.title
    : item.type === 'EVENT'
      ? item.event.title
      : item.thingDate.label;
}

/** Places unscheduled and overdue work at the top of Today. */
function group(item: AgendaItem) {
  return item.type === 'TASK' && (item.overdue || !item.task.scheduledOn)
    ? 0
    : item.type === 'TASK'
      ? 2
      : 1;
}

/** Orders each day's work by importance and appointments by time. */
export function compareItems(a: AgendaItem, b: AgendaItem): number {
  const groupDifference = group(a) - group(b);
  if (groupDifference) return groupDifference;
  if (a.type === 'TASK' && b.type === 'TASK')
    return (
      importanceRank[a.task.importance] - importanceRank[b.task.importance] ||
      (a.task.deadlineOn ?? '').localeCompare(b.task.deadlineOn ?? '') ||
      itemTitle(a).localeCompare(itemTitle(b))
    );
  const time = (item: AgendaItem) =>
    item.type === 'EVENT' && item.event.startsAt ? parseISO(item.event.startsAt).getTime() : 0;
  return time(a) - time(b) || itemTitle(a).localeCompare(itemTitle(b));
}

/** Combines calendar groups with pending followups from earlier days. */
export function buildAgenda(input: AgendaInput, now = new Date()): Agenda {
  const today = dayKey(now),
    tomorrow = dayKey(addDays(now, 1));
  const placed: AgendaItem[] = [],
    followups: AgendaItem[] = [];
  for (const task of input.tasks) {
    if (task.status === 'SUGGESTED' || task.status === 'CLOSED') continue;
    const item: AgendaItem = {
      type: 'TASK',
      key: `task:${task.id}`,
      thingId: task.thingId,
      thingName: input.thingNames[task.thingId],
      day: task.scheduledOn && task.scheduledOn > today ? task.scheduledOn : today,
      overdue: isOverdue(task, today),
      task,
    };
    const completedToday = !!task.completedAt && dayKey(task.completedAt) === today;
    if (task.status === 'COMPLETED' && !completedToday) {
      if (task.completionActions.length) followups.push({ ...item, day: today, overdue: false });
    } else placed.push(item);
  }
  for (const event of input.events) {
    if (event.status === 'CLOSED' || (!event.startsAt && !event.startsOn)) continue;
    const day = event.startsAt ? dayKey(event.startsAt) : event.startsOn!;
    const item: AgendaItem = {
      type: 'EVENT',
      key: `event:${event.id}`,
      thingId: event.thingId,
      thingName: input.thingNames[event.thingId],
      day: day < today ? today : day,
      overdue: false,
      event,
    };
    if (hasEventEnded(event, now)) {
      if (event.completionActions.length) followups.push({ ...item, day: today });
    } else placed.push(item);
  }
  for (const date of input.thingDates) {
    const name = input.thingNames[date.thingId];
    if (date.date < today || name === undefined) continue;
    placed.push({
      type: 'THING_DATE',
      key: `date:${date.thingId}:${date.fieldSetId}:${date.fieldId}:${date.customFieldId}`,
      thingId: date.thingId,
      day: date.date,
      overdue: false,
      thingDate: date,
      thingName: name,
    });
  }
  const days = new Map<string, AgendaItem[]>();
  for (const item of placed) days.set(item.day, [...(days.get(item.day) ?? []), item]);
  for (const items of days.values()) items.sort(compareItems);
  const upcoming: AgendaDay[] = [...days]
    .filter(([day]) => day > tomorrow)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({ date, items }));
  return {
    today: days.get(today) ?? [],
    tomorrow: days.get(tomorrow) ?? [],
    upcoming,
    followups: followups.sort(compareItems),
  };
}

/** First agenda items for Thing previews, including pending followups. */
export function nextItems(agenda: Agenda, limit: number) {
  return [
    ...agenda.followups,
    ...agenda.today,
    ...agenda.tomorrow,
    ...agenda.upcoming.flatMap((day) => day.items),
  ].slice(0, limit);
}

/** Suggestions ordered by importance and title. */
export function byImportance(tasks: Task[]) {
  return [...tasks].sort(
    (a, b) =>
      importanceRank[a.importance] - importanceRank[b.importance] || a.title.localeCompare(b.title),
  );
}

export type TimeLine =
  | { type: 'overdue'; days: number }
  | { type: 'countdown'; days: number; date: string }
  | { type: 'interval'; recurrence: TaskInterval }
  | { type: 'time'; start: string; end: string | null }
  | null;
/** Deadline, interval or appointment time shown under the item title. */
export function timeLine(item: AgendaItem, now = new Date()): TimeLine {
  if (item.type === 'TASK') {
    if (item.task.completedAt) return null;
    if (isOverdue(item.task, dayKey(now)))
      return { type: 'overdue', days: -daysUntil(item.task.deadlineOn!, now) };
    if (item.task.deadlineOn)
      return {
        type: 'countdown',
        days: daysUntil(item.task.deadlineOn, now),
        date: item.task.deadlineOn,
      };
    return item.task.recurrence ? { type: 'interval', recurrence: item.task.recurrence } : null;
  }
  return item.type === 'EVENT' && item.event.startsAt
    ? { type: 'time', start: item.event.startsAt, end: item.event.endsAt }
    : null;
}
