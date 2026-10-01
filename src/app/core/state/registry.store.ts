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
import { RegistryService } from '../data/registry.service';
import type { RegistryIndex } from '../../interfaces/thing.interface';
import { withLoad, withSession } from './with-load';

interface Registry {
  fieldSets: Schema['FieldSet'][];
  fields: Schema['FieldDefinition'][];
}

/** Read-only field sets and field definitions. */
export const RegistryStore = signalStore(
  { providedIn: 'root' },

  withState<Registry>({ fieldSets: [], fields: [] }),

  withProps(() => ({ _service: inject(RegistryService) })),

  withComputed(({ fieldSets, fields }) => ({
    index: computed<RegistryIndex>(() => ({
      fieldSets: Object.fromEntries(fieldSets().map((set) => [set.id, set])),
      fields: Object.fromEntries(fields().map((field) => [field.id, field])),
    })),
  })),

  withFeature((store) =>
    withLoad(
      async (): Promise<Registry> => {
        const [fieldSets, fields] = await Promise.all([
          store._service.fieldSets(),
          store._service.fields(),
        ]);

        return { fieldSets, fields };
      },
      (registry) => patchState(store, registry),
    ),
  ),

  withMethods((store) => ({
    reset() {
      store._resetLoad();
      patchState(store, { fieldSets: [], fields: [] });
    },
  })),

  withFeature((store) => withSession(store.reset)),
);
