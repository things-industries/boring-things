import { computed, inject, signal, type Signal } from '@angular/core';
import type { Agenda, CompletionAction } from '../../../interfaces/task.interface';
import { buildAgenda } from '../../../utils/agenda.util';
import {
  isTaskEvent,
  mockAppointment,
  mockDeadline,
  mockDeadlineFields,
  mockLoadThingDetails,
  mockThingDates,
} from '../../mocks/tasks.mock';
import { EventsStore } from '../events.store';
import { IssuesStore } from '../issues.store';
import { loadCollections } from '../load-collections';
import { TasksStore } from '../tasks.store';
import { ThingsStore } from '../things.store';

/**
 * Loads the stores the agenda reads, the Thing details its dates come from, and the issues its
 * completion actions resolve.
 */
export function loadAgenda() {
  const things = inject(ThingsStore);
  const collections = loadCollections(things, inject(TasksStore));

  void inject(IssuesStore).ensureLoaded();
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
  const issues = inject(IssuesStore);

  /** Leaves out resolving an issue that is already resolved. */
  const available = (actions: CompletionAction[], issueId: string | null) =>
    actions.filter(
      (action) =>
        action.type !== 'RESOLVE_ISSUE' ||
        (!!issueId && issues.entityMap()[issueId]?.status !== 'RESOLVED'),
    );

  return computed(() => {
    const only = thingId();
    const shown = things.entities().filter((thing) => !only || thing.id === only);
    const names = Object.fromEntries(shown.map((thing) => [thing.id, thing.name]));
    const deadlines = mockDeadlineFields(shown);

    return buildAgenda(
      {
        tasks: tasks
          .entities()
          .filter((task) => task.thingId in names)
          .map((task) => mockDeadline(task, deadlines))
          .map((task) => ({
            ...task,
            completionActions: available(task.completionActions, task.issueId),
          })),
        events: events
          .entities()
          .filter((event) => !isTaskEvent(event) && event.thingId in names)
          .map(mockAppointment)
          .map((event) => ({
            ...event,
            completionActions: available(event.completionActions, event.issueId),
          })),
        thingDates: mockThingDates(deadlines),
        thingNames: names,
      },
      now(),
    );
  });
}
