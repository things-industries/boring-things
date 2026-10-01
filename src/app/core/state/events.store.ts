import { computed, inject } from '@angular/core';
import { signalStore, withComputed, withFeature, withMethods, withProps } from '@ngrx/signals';
import type { Schema } from '../../../../shared/model';
import type { ActionTerm } from '../../interfaces/terms.interface';
import { EventsService } from '../data/events.service';
import { groupBy } from '../../utils/collection.util';
import { updating } from './optimistic';
import { withEntityCollection } from './with-entity-collection';

/** Events ordered by start in the browser's time zone, undated last, as the API orders them. */
export const EventsStore = signalStore(
  { providedIn: 'root' },

  withProps(() => ({
    _service: inject(EventsService),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  })),

  withFeature((store) =>
    withEntityCollection<Schema['Event']>({
      list: () => store._service.list(store.timeZone),
      get: (id) => store._service.get(id),
    }),
  ),

  withComputed(({ entities }) => ({
    eventsByThing: computed(() => groupBy(entities(), (event) => event.thingId)),
  })),

  withMethods((store) => ({
    create(input: Schema['EventInput']) {
      const status = input.status ?? 'SCHEDULED';

      const event: Schema['Event'] = {
        id: crypto.randomUUID(),
        thingId: input.thingId,
        issueId: input.issueId ?? null,
        title: input.title,
        description: input.description ?? '',
        status,
        startsAt: input.startsAt ?? null,
        startsOn: input.startsOn ?? null,
        completedAt: status === 'COMPLETED' ? new Date().toISOString() : null,
        sourceRefs: [],
        isSample: false,
      };

      return store.create('addEvent', event, () => store._service.create(input));
    },

    update(id: string, patch: Schema['EventPatch'], action: ActionTerm = 'saveChanges') {
      const step = store.stage(
        id,
        updating((event) => patchEvent(event, patch)),
      );

      return store.mutate(action, [step], () => store._service.update(id, patch), {
        confirm: (event) => event,
        refetch: () => store.loadOne(id),
      });
    },
  })),

  withMethods((store) => ({
    complete: (id: string) => store.update(id, { status: 'COMPLETED' }, 'completeEvent'),

    schedule: (id: string, when: Pick<Schema['EventPatch'], 'startsAt' | 'startsOn'>) =>
      store.update(id, { status: 'SCHEDULED', ...when }, 'scheduleEvent'),
  })),
);

function patchEvent(event: Schema['Event'], patch: Schema['EventPatch']): Schema['Event'] {
  const next = { ...event, ...patch };

  if (patch.status && patch.status !== event.status)
    next.completedAt = patch.status === 'COMPLETED' ? new Date().toISOString() : null;
  return next;
}
