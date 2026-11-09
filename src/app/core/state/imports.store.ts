// Keeps owner-scoped Import snapshots available while a progress page is open.
import { inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withFeature,
  withMethods,
  withProps,
  withState,
} from '@ngrx/signals';
import type { Schema } from '../../../../shared/model';
import { ImportsService } from '../data/imports.service';
import { Streams } from './streams';
import { withSession } from './with-load';

export const ImportsStore = signalStore(
  { providedIn: 'root' },
  withState<{ records: Record<string, Schema['Import']>; disconnected: Record<string, boolean> }>({
    records: {},
    disconnected: {},
  }),
  withProps(() => ({ _service: inject(ImportsService), _streams: new Streams() })),
  withMethods((store) => {
    let generation = 0;
    const save = (value: Schema['Import']) => {
      if ((store.records()[value.id]?.revision ?? 0) > value.revision) return;
      patchState(store, { records: { ...store.records(), [value.id]: value } });
    };
    return {
      async loadOne(id: string) {
        const current = generation;
        const value = await store._service.get(id);
        if (current === generation) save(value);
      },
      watch(id: string) {
        const current = generation;
        return store._streams.watch(id, (signal) => {
          void store._service.watch(
            id,
            signal,
            (value) => {
              if (current === generation) save(value);
            },
            () => {
              if (current === generation)
                patchState(store, {
                  disconnected: { ...store.disconnected(), [id]: true },
                });
            },
          );
        });
      },
      async retry(id: string) {
        const current = generation;
        const value = await store._service.retry(id);
        if (current === generation) save(value);
      },
      reset() {
        generation++;
        store._streams.stopAll();
        patchState(store, { records: {}, disconnected: {} });
      },
    };
  }),

  withFeature((store) => withSession(() => store.reset())),
);
