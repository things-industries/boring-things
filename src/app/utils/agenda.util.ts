import { addDays, parseISO } from 'date-fns';
import type { EventRecurrence } from '../interfaces/event.interface';
import type {
  Agenda,
  AgendaDay,
  AgendaItem,
  Appointment,
  Task,
  TaskPriority,
  ThingDate,
} from '../interfaces/task.interface';
import { dayKey, daysUntil } from './date.util';

export const priorityRank: Record<TaskPriority, number> = {
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

/** Whether an open task has passed its deadline, or its day when it has no deadline. */
export function isOverdue(task: Task, today: string): boolean {
  const due = task.deadlineOn ?? task.scheduledOn;

  return task.status !== 'SUGGESTED' && !!due && due < today;
}

/**
 * Where a scheduled or completed task sits. An open task from an earlier day rolls into today; a
 * completed one stays there only on the day it was completed.
 */
function placeTask(task: Task, today: string): AgendaItem | null {
  if (task.status === 'SUGGESTED' || !task.scheduledOn) return null;

  const past = task.scheduledOn < today;

  if (
    past &&
    task.status === 'COMPLETED' &&
    (!task.completedAt || dayKey(task.completedAt) < today)
  )
    return null;
  return {
    type: 'TASK',
    key: `task:${task.id}`,
    thingId: task.thingId,
    day: past ? today : task.scheduledOn,
    overdue: isOverdue(task, today),
    task,
  };
}

/**
 * Where an appointment sits. A past one shows today only while its follow-up is open, or on the day
 * that follow-up was answered.
 */
function placeEvent(event: Appointment, today: string): AgendaItem | null {
  const start = event.startsAt ?? event.startsOn;

  if (!start || (event.status !== 'SCHEDULED' && event.status !== 'COMPLETED')) return null;

  const day = event.startsAt ? dayKey(event.startsAt) : start;
  const item = (overdue: boolean): AgendaItem => ({
    type: 'EVENT',
    key: `event:${event.id}`,
    thingId: event.thingId,
    day: overdue ? today : day,
    overdue,
    event,
  });

  if (day >= today) return item(false);
  if (!event.followUp) return null;
  if (event.status === 'SCHEDULED') return item(true);
  return event.completedAt && dayKey(event.completedAt) === today ? item(true) : null;
}

function placeThingDate(
  thingDate: ThingDate,
  thingNames: Record<string, string>,
  today: string,
): AgendaItem | null {
  const thingName = thingNames[thingDate.thingId];

  if (thingDate.date < today || thingName === undefined) return null;
  return {
    type: 'THING_DATE',
    key: `date:${thingDate.thingId}:${thingDate.fieldId}`,
    thingId: thingDate.thingId,
    day: thingDate.date,
    overdue: false,
    thingDate,
    thingName,
  };
}

/** Events and Thing dates first, then tasks, then overdue items; see `compareItems`. */
function group(item: AgendaItem): number {
  if (item.overdue) return 2;
  return item.type === 'TASK' ? 1 : 0;
}

/** Start time for ordering; all-day items sort first. */
function startTime(item: AgendaItem): number {
  return item.type === 'EVENT' && item.event.startsAt ? parseISO(item.event.startsAt).getTime() : 0;
}

/** Overdue events lead the overdue block, as events lead the day. */
function rank(item: AgendaItem): number {
  return item.type === 'TASK' ? priorityRank[item.task.priority] + 1 : 0;
}

/** Whether a task or appointment has been checked off. */
export function isDone(item: AgendaItem): boolean {
  if (item.type === 'TASK') return item.task.status === 'COMPLETED';
  return item.type === 'EVENT' && item.event.status === 'COMPLETED';
}

/** An item's own title; a Thing date's is its field label. */
export function itemTitle(item: AgendaItem): string {
  if (item.type === 'TASK') return item.task.title;
  if (item.type === 'EVENT') return item.event.title;
  return item.thingDate.label;
}

/** Day this item was due, for ordering overdue items oldest first. */
function dueDay(item: AgendaItem): string {
  if (item.type === 'TASK') return item.task.deadlineOn ?? item.task.scheduledOn ?? '';
  if (item.type === 'EVENT') return item.event.startsAt ?? item.event.startsOn ?? '';
  return item.thingDate.date;
}

/**
 * Orders a day: events and Thing dates by start time, then tasks by priority, then overdue items by
 * priority and oldest first. Titles break ties.
 */
export function compareItems(a: AgendaItem, b: AgendaItem): number {
  const ga = group(a);

  return (
    ga - group(b) ||
    (ga === 0 ? startTime(a) - startTime(b) : rank(a) - rank(b)) ||
    (ga === 2 ? dueDay(a).localeCompare(dueDay(b)) : 0) ||
    itemTitle(a).localeCompare(itemTitle(b))
  );
}

/** Groups tasks, appointments and Thing dates into Today, Tomorrow and later days. */
export function buildAgenda(input: AgendaInput, now = new Date()): Agenda {
  const today = dayKey(now);
  const tomorrow = dayKey(addDays(now, 1));
  const placed = [
    ...input.tasks.map((task) => placeTask(task, today)),
    ...input.events.map((event) => placeEvent(event, today)),
    ...input.thingDates.map((date) => placeThingDate(date, input.thingNames, today)),
  ].filter((item) => item !== null);

  const days = new Map<string, AgendaItem[]>();

  for (const item of placed) days.set(item.day, [...(days.get(item.day) ?? []), item]);
  for (const items of days.values()) items.sort(compareItems);

  const upcoming: AgendaDay[] = [...days]
    .filter(([day]) => day > tomorrow)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({ date, items }));

  return { today: days.get(today) ?? [], tomorrow: days.get(tomorrow) ?? [], upcoming };
}

/** The first `limit` items from today on, in agenda order, for previews of the agenda. */
export function nextItems(agenda: Agenda, limit: number): AgendaItem[] {
  return [
    ...agenda.today,
    ...agenda.tomorrow,
    ...agenda.upcoming.flatMap((day) => day.items),
  ].slice(0, limit);
}

/** Tasks by priority, then title, as suggestions are listed. */
export function byPriority(tasks: Task[]): Task[] {
  return [...tasks].sort(
    (a, b) => priorityRank[a.priority] - priorityRank[b.priority] || a.title.localeCompare(b.title),
  );
}

/** What an agenda item's meta line shows; the template chooses the copy. */
export type TimeLine =
  | { type: 'overdue'; days: number }
  | { type: 'countdown'; days: number; date: string }
  | { type: 'interval'; recurrence: EventRecurrence }
  | { type: 'time'; start: string; end: string | null }
  | null;

/**
 * Overdue days for an open overdue item; otherwise a deadline countdown or interval for a task, and
 * the time of a timed event.
 */
export function timeLine(item: AgendaItem, now = new Date()): TimeLine {
  if (item.type === 'TASK') {
    const { task } = item;

    if (item.overdue && task.status !== 'COMPLETED')
      return { type: 'overdue', days: -daysUntil(task.deadlineOn ?? task.scheduledOn!, now) };
    if (task.deadlineOn)
      return { type: 'countdown', days: daysUntil(task.deadlineOn, now), date: task.deadlineOn };
    return task.recurrence ? { type: 'interval', recurrence: task.recurrence } : null;
  }

  if (item.type === 'EVENT') {
    const { event } = item;

    if (item.overdue && event.status !== 'COMPLETED')
      return { type: 'overdue', days: -daysUntil(event.startsAt ?? event.startsOn!, now) };
    return event.startsAt ? { type: 'time', start: event.startsAt, end: event.endsAt } : null;
  }

  return null;
}
