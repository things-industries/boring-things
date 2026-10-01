import { computed, inject, type Signal } from '@angular/core';
import type { EventView } from '../../../interfaces/event.interface';
import { eventStart, startsFrom } from '../../../utils/date.util';
import { EventsStore } from '../events.store';
import { ThingsStore } from '../things.store';

/** Scheduled events from now on, earliest first, with their Thing's name. */
export function upcomingEventsView(): Signal<EventView[]> {
  const events = inject(EventsStore);
  const things = inject(ThingsStore);

  return computed(() => {
    const now = new Date();
    const thingMap = things.entityMap();

    return events
      .entities()
      .filter((event) => event.status === 'SCHEDULED' && startsFrom(event, now))
      .flatMap((event) => {
        const thing = thingMap[event.thingId];

        return thing ? [{ ...event, thingName: thing.name }] : [];
      })
      .sort((a, b) => (eventStart(a) ?? 0) - (eventStart(b) ?? 0));
  });
}
