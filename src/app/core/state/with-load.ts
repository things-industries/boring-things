import { inject } from '@angular/core';
import { patchState, signalStoreFeature, withHooks, withMethods, withState } from '@ngrx/signals';
import type { Subscription } from 'rxjs';
import { Auth } from '../services/auth.service';
import type { UiErrorCode } from '../../interfaces/error.interface';
import type { LoadStatus } from '../../interfaces/state.interface';
import { errorCode } from '../../utils/error.util';

/**
 * Load status for a store's data. `load()` reuses a request in flight, `ensureLoaded()` does nothing
 * once loaded and `reload()` always fetches. Use inside `withFeature` to reach the store.
 */
export function withLoad<R>(fetchData: () => Promise<R>, receive: (value: R) => void) {
  return signalStoreFeature(
    withState<{ status: LoadStatus; error: UiErrorCode | null }>({ status: 'idle', error: null }),
    withMethods((store) => {
      let inFlight: Promise<void> | null = null;
      let generation = 0;

      function fetch() {
        const current = ++generation;

        if (store.status() !== 'loaded') patchState(store, { status: 'loading', error: null });

        const request = fetchData()
          .then(
            (value) => {
              if (current !== generation) return;
              receive(value);
              patchState(store, { status: 'loaded', error: null });
            },
            (e: unknown) => {
              if (current === generation)
                patchState(store, { status: 'error', error: errorCode(e) });
            },
          )
          .finally(() => {
            if (inFlight === request) inFlight = null;
          });

        inFlight = request;
        return request;
      }

      return {
        load: () => inFlight ?? fetch(),

        ensureLoaded: () =>
          store.status() === 'loaded' ? Promise.resolve() : (inFlight ?? fetch()),

        reload: fetch,

        _resetLoad() {
          generation++;
          inFlight = null;
          patchState(store, { status: 'idle', error: null });
        },
      };
    }),
  );
}

/**
 * Resets the store when the session ends and, with `load`, loads it on sign-in. Use inside
 * `withFeature` to reach the store.
 */
export function withSession(reset: () => void, load?: () => Promise<void>) {
  return signalStoreFeature(
    withHooks(() => {
      const auth = inject(Auth);
      let subscription: Subscription | undefined;

      return {
        onInit() {
          if (auth.signedIn() && load) void load();

          subscription = auth.sessionChanged.subscribe((signedIn) => {
            if (!signedIn) reset();
            else if (load) void load();
          });
        },

        onDestroy: () => subscription?.unsubscribe(),
      };
    }),
  );
}
