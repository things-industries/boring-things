import { signalStoreFeature, withFeature, withMethods } from '@ngrx/signals';
import type { UiErrorCode } from '../../interfaces/error.interface';
import { withLoad, withSession } from './with-load';
import { withOptimisticEntities } from './with-optimistic-entities';

interface EntityCollectionOptions<T> {
  /** Fetches the whole collection. */
  list: () => Promise<T[]>;
  /** Fetches one entity for `loadOne`; without it, `loadOne` reloads the collection. */
  get?: (id: string) => Promise<T>;
  /** Combines a received value with its previous confirmed value. */
  merge?: (previous: T | null, next: T) => T;
  /** Loads on sign-in instead of on first use. */
  loadOnSignIn?: boolean;
  /** Clears the store's other state when the session ends. */
  onReset?: () => void;
}

/**
 * Optimistic entity collection that loads every page once per session, fetches one entity with
 * `loadOne` and clears itself on sign-out. Use inside `withFeature` to reach the store's service.
 */
export function withEntityCollection<T extends { id: string }>(
  options: EntityCollectionOptions<T>,
) {
  return signalStoreFeature(
    withOptimisticEntities<T>(),

    withFeature((store) =>
      withLoad(options.list, (values) =>
        store.receive(values, { replace: true, merge: options.merge }),
      ),
    ),

    withMethods((store) => ({
      /** Fetches one entity again; a `404` removes it. Resolves to the error code on failure. */
      loadOne(id: string): Promise<UiErrorCode | null> {
        const { get } = options;

        if (get) return store.refresh(id, () => get(id));
        return store.reload().then(() => store.error());
      },

      reset() {
        options.onReset?.();
        store._resetLoad();
        store._clearEntities();
      },
    })),

    withFeature((store) => withSession(store.reset, options.loadOnSignIn ? store.load : undefined)),
  );
}
