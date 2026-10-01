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
import { ProfileService } from '../data/profile.service';
import { Toasts } from '../services/toasts.service';
import { errorCode } from '../../utils/error.util';
import { CategoriesStore } from './categories.store';
import { ThingsStore } from './things.store';
import { withLoad, withSession } from './with-load';

export const ProfileStore = signalStore(
  { providedIn: 'root' },

  withState<{ profile: Schema['Profile'] | null; seeding: boolean }>({
    profile: null,
    seeding: false,
  }),

  withProps(() => ({
    _service: inject(ProfileService),
    _toasts: inject(Toasts),
    _categories: inject(CategoriesStore),
    _things: inject(ThingsStore),
  })),

  withFeature((store) =>
    withLoad(
      () => store._service.get(),
      (profile) => patchState(store, { profile }),
    ),
  ),

  withMethods((store) => ({
    /** Adds the sample records, then reloads every collection they belong to. */
    async seedSamples() {
      patchState(store, { seeding: true });
      try {
        patchState(store, { profile: await store._service.seedSamples() });
        await Promise.all([store._categories.reload(), store._things.reloadWithChildren()]);
      } catch (e) {
        store._toasts.error('addSampleData', errorCode(e));
      } finally {
        patchState(store, { seeding: false });
      }
    },

    reset() {
      store._resetLoad();
      patchState(store, { profile: null, seeding: false });
    },
  })),

  withFeature((store) => withSession(store.reset, store.load)),
);
