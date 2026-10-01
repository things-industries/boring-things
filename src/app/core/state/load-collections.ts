import { computed } from '@angular/core';
import type { LoadableStore } from '../../interfaces/state.interface';

/**
 * Loads a page's stores and reports them together: `loaded` once every store has settled, `error`
 * from the first failed store, and `retry` reloading only the failed ones.
 */
export function loadCollections(...stores: LoadableStore[]) {
  for (const store of stores) void store.ensureLoaded();

  return {
    loaded: computed(() =>
      stores.every((store) => store.status() === 'loaded' || store.status() === 'error'),
    ),

    error: computed(() => stores.find((store) => store.status() === 'error')?.error() ?? null),

    retry() {
      for (const store of stores) if (store.status() === 'error') void store.reload();
    },
  };
}
