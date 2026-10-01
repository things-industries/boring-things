import { computed, inject, type Signal } from '@angular/core';
import type { Schema } from '../../../../../shared/model';
import { CategoriesStore } from '../categories.store';
import { ThingsStore } from '../things.store';

/** Categories whose `thingCount` follows the loaded Things. */
export function categoriesView(): Signal<Schema['Category'][]> {
  const categories = inject(CategoriesStore);
  const things = inject(ThingsStore);

  return computed(() => {
    if (things.status() !== 'loaded') return categories.entities();

    const byCategory = things.thingsByCategory();

    return categories
      .entities()
      .map((category) => ({ ...category, thingCount: byCategory[category.id]?.length ?? 0 }));
  });
}
