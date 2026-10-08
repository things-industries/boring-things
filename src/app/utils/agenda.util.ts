import { addDays, parseISO } from 'date-fns';
import type {
  Agenda,
  AgendaDay,
  AgendaItem,
  Appointment,
  Task,
  TaskPriority,
  ThingDate,
} from '../interfaces/task.interface';
import { dayKey } from './date.util';

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

/** An item and the day it sits on. */
interface Placed {
  day: string;
  item: AgendaItem;
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
function placeTask(task: Task, today: string): Placed | null {
  if (task.status === 'SUGGESTED' || !task.scheduledOn) return null;

  const past = task.scheduledOn < today;

  if (
    past &&
    task.status === 'COMPLETED' &&
    (!task.completedAt || dayKey(task.completedAt) < today)
  )
    return null;
  return {
    day: past ? today : task.scheduledOn,
    item: {
      type: 'TASK',
      key: `task:${task.id}`,
      thingId: task.thingId,
      overdue: isOverdue(task, today),
      task,
    },
  };
}

/**
 * Where an appointment sits. A past one shows today only while its follow-up is open, or on the day
 * that follow-up was answered.
 */
function placeEvent(event: Appointment, today: string): Placed | null {
  const start = event.startsAt ?? event.startsOn;

  if (!start || (event.status !== 'SCHEDULED' && event.status !== 'COMPLETED')) return null;

  const day = event.startsAt ? dayKey(event.startsAt) : start;
  const item = (overdue: boolean): AgendaItem => ({
    type: 'EVENT',
    key: `event:${event.id}`,
    thingId: event.thingId,
    overdue,
    event,
  });

  if (day >= today) return { day, item: item(false) };
  if (!event.followUp) return null;
  if (event.status === 'SCHEDULED') return { day: today, item: item(true) };
  return event.completedAt && dayKey(event.completedAt) === today
    ? { day: today, item: item(true) }
    : null;
}

function placeThingDate(
  thingDate: ThingDate,
  thingNames: Record<string, string>,
  today: string,
): Placed | null {
  const thingName = thingNames[thingDate.thingId];

  if (thingDate.date < today || thingName === undefined) return null;
  return {
    day: thingDate.date,
    item: {
      type: 'THING_DATE',
      key: `date:${thingDate.thingId}:${thingDate.fieldId}`,
      thingId: thingDate.thingId,
      overdue: false,
      thingDate,
      thingName,
    },
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

function title(item: AgendaItem): string {
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
    title(a).localeCompare(title(b))
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
  ].filter((p): p is Placed => p !== null);

  const days = new Map<string, AgendaItem[]>();

  for (const { day, item } of placed) days.set(day, [...(days.get(day) ?? []), item]);
  for (const items of days.values()) items.sort(compareItems);

  const upcoming: AgendaDay[] = [...days]
    .filter(([day]) => day > tomorrow)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, items]) => ({ date, items }));

  return { today: days.get(today) ?? [], tomorrow: days.get(tomorrow) ?? [], upcoming };
}
