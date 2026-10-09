import { computed, inject, signal, type Signal } from '@angular/core';
import type { Agenda } from '../../../interfaces/task.interface';
import { buildAgenda } from '../../../utils/agenda.util';
import {
  isTaskEvent,
  mockAppointment,
  mockDeadline,
  mockLoadThingDetails,
  mockThingDates,
} from '../../mocks/tasks.mock';
import { EventsStore } from '../events.store';
import { loadCollections } from '../load-collections';
import { TasksStore } from '../tasks.store';
import { ThingsStore } from '../things.store';

/** Loads the stores the agenda reads, and the Thing details its dates come from. */
export function loadAgenda() {
  const things = inject(ThingsStore);
  const collections = loadCollections(things, inject(TasksStore));

  void mockLoadThingDetails(things);
  return collections;
}

/** Tasks, appointments and Thing dates in Today, Tomorrow and later days, for one Thing if given. */
export function agendaView(
  now: Signal<Date>,
  thingId: Signal<string | null> = signal(null),
): Signal<Agenda> {
  const tasks = inject(TasksStore);
  const events = inject(EventsStore);
  const things = inject(ThingsStore);

  return computed(() => {
    const only = thingId();
    const shown = things.entities().filter((thing) => !only || thing.id === only);
    const names = Object.fromEntries(shown.map((thing) => [thing.id, thing.name]));
    const thingDates = mockThingDates(shown);

    return buildAgenda(
      {
        tasks: tasks
          .entities()
          .filter((task) => task.thingId in names)
          .map((task) => mockDeadline(task, thingDates)),
        events: events
          .entities()
          .filter((event) => !isTaskEvent(event) && event.thingId in names)
          .map(mockAppointment),
        thingDates,
        thingNames: names,
      },
      now(),
    );
  });
}
