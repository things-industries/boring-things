import { computed, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withFeature,
  withMethods,
  withProps,
  withState,
} from '@ngrx/signals';
import type { Schema } from '../../../../shared/model';
import { PurchasablesService } from '../data/purchasables.service';
import type { UiErrorCode } from '../../interfaces/error.interface';
import type { LoadStatus } from '../../interfaces/state.interface';
import { groupBy } from '../../utils/collection.util';
import { errorCode } from '../../utils/error.util';
import { withSession } from './with-load';
import { withOptimisticEntities } from './with-optimistic-entities';

/** Purchasables, loaded per Thing. */
export const PurchasablesStore = signalStore(
  { providedIn: 'root' },

  withOptimisticEntities<Schema['Purchasable']>(),

  withState<{ thingStatus: Record<string, { status: LoadStatus; error: UiErrorCode | null }> }>({
    thingStatus: {},
  }),

  withProps(() => ({
    _service: inject(PurchasablesService),
    _inFlight: new Map<string, Promise<void>>(),
  })),

  withComputed(({ entities }) => ({
    purchasablesByThing: computed(() => groupBy(entities(), (item) => item.thingId)),
  })),

  withMethods((store) => {
    const setStatus = (thingId: string, status: LoadStatus, error: UiErrorCode | null = null) =>
      patchState(store, { thingStatus: { ...store.thingStatus(), [thingId]: { status, error } } });

    function fetch(thingId: string) {
      setStatus(thingId, 'loading');

      const request = store._service
        .list(thingId)
        .then(
          (items) => {
            const current = new Set(items.map((item) => item.id));

            for (const item of store.purchasablesByThing()[thingId] ?? [])
              if (!current.has(item.id)) store.setConfirmed(item.id, null);
            store.receive(items);
            setStatus(thingId, 'loaded');
          },
          (e: unknown) => setStatus(thingId, 'error', errorCode(e)),
        )
        .finally(() => store._inFlight.delete(thingId));

      store._inFlight.set(thingId, request);
      return request;
    }

    return {
      loadForThing: (thingId: string) => store._inFlight.get(thingId) ?? fetch(thingId),

      ensureLoadedForThing: (thingId: string) =>
        store.thingStatus()[thingId]?.status === 'loaded'
          ? Promise.resolve()
          : (store._inFlight.get(thingId) ?? fetch(thingId)),

      /** Fetches one purchasable; a `404` removes it. Resolves to the error code on failure. */
      loadOne: (id: string) => store.refresh(id, () => store._service.get(id)),

      reset() {
        store._inFlight.clear();
        store._clearEntities();
        patchState(store, { thingStatus: {} });
      },
    };
  }),

  withFeature((store) => withSession(store.reset)),
);
