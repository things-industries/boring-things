/** Upcoming Thing date fields loaded through the user-scoped date API. */

import { inject } from '@angular/core';
import { patchState, signalStore, withFeature, withProps, withState } from '@ngrx/signals';
import type { ThingDate } from '../../interfaces/task.interface';
import { allPages } from '../api/api-client';
import { Api } from '../services/api.service';
import { withLoad, withSession } from './with-load';

export const ThingDatesStore = signalStore(
  { providedIn: 'root' },
  withState({ entities: [] as ThingDate[] }),
  withProps(() => ({ _client: inject(Api).client })),
  withFeature((store) =>
    withLoad(
      () =>
        allPages((query) =>
          store._client.GET('/api/thing-dates', {
            params: {
              query: { ...query, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
            },
          }),
        ),
      (entities) => patchState(store, { entities }),
    ),
  ),
  withFeature((store) =>
    withSession(() => {
      store._resetLoad();
      patchState(store, { entities: [] });
    }),
  ),
);
