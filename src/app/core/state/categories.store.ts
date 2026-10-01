import { inject } from '@angular/core';
import { signalStore, withFeature, withProps } from '@ngrx/signals';
import type { Schema } from '../../../../shared/model';
import { CategoriesService } from '../data/categories.service';
import { withEntityCollection } from './with-entity-collection';

/** Registry categories. `thingCount` is the server's count; `categoriesView` derives it live. */
export const CategoriesStore = signalStore(
  { providedIn: 'root' },

  withProps(() => ({ _service: inject(CategoriesService) })),

  withFeature((store) =>
    withEntityCollection<Schema['Category']>({
      list: () => store._service.list(),
      loadOnSignIn: true,
    }),
  ),
);
