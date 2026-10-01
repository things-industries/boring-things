import { computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { map } from 'rxjs';
import { ThingsStore } from '../../core/state/things.store';
import type { UiErrorCode } from '../../interfaces/error.interface';
import type { ThingRecord } from '../../interfaces/thing.interface';

/**
 * Loads the Thing at the route's `:id` with its detail and watches its stream while the page is
 * open. `loaded` is true once the detail is available or the load has settled; `missing` once a
 * settled load found no Thing.
 */
export function routeThing() {
  const things = inject(ThingsStore);
  const route = inject(ActivatedRoute);

  const id = toSignal(route.paramMap.pipe(map((params) => params.get('id') ?? '')), {
    requireSync: true,
  });

  const settled = signal<{ id: string; error: UiErrorCode | null } | null>(null);
  const thing = computed<ThingRecord | null>(() => things.entityMap()[id()] ?? null);
  const detail = computed(() => thing()?.detail ?? null);

  const load = (current: string) => {
    void things.loadOne(current).then((error) => {
      if (untracked(id) === current) settled.set({ id: current, error });
    });
  };

  effect((onCleanup) => {
    const current = id();

    untracked(() => {
      settled.set(null);
      load(current);
    });
    onCleanup(things.watch(current));
  });

  const done = computed(() => settled()?.id === id());

  return {
    id,
    thing,
    detail,
    loaded: computed(() => !!detail() || done()),
    missing: computed(() => done() && !thing() && settled()?.error === 'not-found'),
    error: computed(() => {
      const error = done() ? settled()?.error : null;

      return error && error !== 'not-found' && !detail() ? error : null;
    }),
    disconnected: computed(() => !!things.disconnected()[id()]),
    retry: () => load(untracked(id)),
  };
}
