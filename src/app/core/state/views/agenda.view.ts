import { computed, inject, type Signal } from '@angular/core';
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

/** Tasks, appointments and Thing dates in Today, Tomorrow and later days. */
export function agendaView(now: Signal<Date>): Signal<Agenda> {
  const tasks = inject(TasksStore);
  const events = inject(EventsStore);
  const things = inject(ThingsStore);

  return computed(() => {
    const thingMap = things.entityMap();
    const thingDates = mockThingDates(things.entities());

    return buildAgenda(
      {
        tasks: tasks
          .entities()
          .filter((task) => thingMap[task.thingId])
          .map((task) => mockDeadline(task, thingDates)),
        events: events
          .entities()
          .filter((event) => !isTaskEvent(event) && thingMap[event.thingId])
          .map(mockAppointment),
        thingDates,
        thingNames: Object.fromEntries(things.entities().map((thing) => [thing.id, thing.name])),
      },
      now(),
    );
  });
}
