/** Timeline read model over persisted Tasks, Events and derived Thing dates. */

import { computed, inject, signal, type Signal } from '@angular/core';
import type { Agenda } from '../../../interfaces/task.interface';
import { buildAgenda } from '../../../utils/agenda.util';
import { EventsStore } from '../events.store';
import { IssuesStore } from '../issues.store';
import { loadCollections } from '../load-collections';
import { TasksStore } from '../tasks.store';
import { ThingsStore } from '../things.store';
import { ThingDatesStore } from '../thing-dates.store';

/** Loads all collections used by the timeline and followup dialogs. */
export function loadAgenda() {
  return loadCollections(
    inject(ThingsStore),
    inject(TasksStore),
    inject(EventsStore),
    inject(ThingDatesStore),
    inject(IssuesStore),
  );
}

/** Combines the user's work and dates, optionally for one Thing. */
export function agendaView(
  now: Signal<Date>,
  thingId: Signal<string | null> = signal(null),
): Signal<Agenda> {
  const tasks = inject(TasksStore),
    events = inject(EventsStore),
    things = inject(ThingsStore),
    dates = inject(ThingDatesStore);
  return computed(() => {
    const names = Object.fromEntries(
      things
        .entities()
        .filter((thing) => !thingId() || thing.id === thingId())
        .map((thing) => [thing.id, thing.name]),
    );
    return buildAgenda(
      {
        tasks: tasks.entities().filter((task) => task.thingId in names),
        events: events.entities().filter((event) => event.thingId in names),
        thingDates: dates.entities().filter((date) => date.thingId in names),
        thingNames: names,
      },
      now(),
    );
  });
}
