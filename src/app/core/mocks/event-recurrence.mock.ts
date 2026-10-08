// Mock for #100 (replaces #11): Event kind and recurrence. Remove when #100 is delivered.
import type { Schema } from '../../../../shared/model';
import type { EventKind, EventRecurrence, TaskView } from '../../interfaces/event.interface';
function kind(event: Schema['Event']): EventKind {
  const text = `${event.title} ${event.description}`;
  if (/clean|descale|wash/i.test(text)) return 'CLEANING';
  if (/check|inspect|test|review/i.test(text)) return 'INSPECTION';
  if (/repair|fix/i.test(text)) return 'REPAIR';
  if (/replace|change the/i.test(text)) return 'REPLACEMENT';
  if (/service/i.test(text)) return 'SERVICE';
  return 'OTHER';
}
const units: Record<string, EventRecurrence['unit']> = {
  day: 'DAY',
  week: 'WEEK',
  month: 'MONTH',
  year: 'YEAR',
};
function recurrence(event: Schema['Event']): EventRecurrence | null {
  const match = /every (\d+ )?(day|week|month|year)s?/i.exec(`${event.title} ${event.description}`);
  return match ? { interval: Number(match[1] ?? 1), unit: units[match[2].toLowerCase()] } : null;
}
/** Adds a kind inferred from the title and a recurrence read from "every {n} {unit}" text. */
export function mockEventRecurrence(event: Schema['Event']): TaskView {
  return { ...event, kind: kind(event), recurrence: recurrence(event) };
}
