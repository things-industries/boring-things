import { computed, inject } from '@angular/core';
import { signalStore, withComputed, withFeature, withMethods, withProps } from '@ngrx/signals';
import type { Schema } from '../../../../shared/model';
import { TagsService } from '../data/tags.service';
import { removing, updating } from './optimistic';
import { withEntityCollection } from './with-entity-collection';

export const TagsStore = signalStore(
  { providedIn: 'root' },

  withProps(() => ({ _service: inject(TagsService) })),

  withFeature((store) =>
    withEntityCollection<Schema['Tag']>({ list: () => store._service.list(), loadOnSignIn: true }),
  ),

  withComputed(({ entities }) => ({
    sorted: computed(() => [...entities()].sort((a, b) => a.name.localeCompare(b.name))),
  })),

  withMethods((store) => ({
    create(name: string) {
      return store.create('addTag', { id: crypto.randomUUID(), name }, () =>
        store._service.create({ name }),
      );
    },

    rename(id: string, name: string) {
      const step = store.stage(
        id,
        updating((tag) => ({ ...tag, name })),
      );

      return store.mutate('renameTag', [step], () => store._service.update(id, { name }), {
        confirm: (tag) => tag,
        refetch: () => store.reload(),
      });
    },

    remove(id: string) {
      return store.mutate(
        'deleteTag',
        [store.stage(id, removing)],
        () => store._service.remove(id),
        {
          refetch: () => store.reload(),
        },
      );
    },
  })),
);
