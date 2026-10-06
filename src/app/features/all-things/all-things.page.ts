import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { map } from 'rxjs';
import { searchThings } from '../../core/app-icons';
import { CategoriesStore } from '../../core/state/categories.store';
import { ThingsStore } from '../../core/state/things.store';
import { loadCollections } from '../../core/state/load-collections';
import { categoriesView } from '../../core/state/views/categories.view';
import { CardGroup } from '../../components/card-group/card-group';
import { CategoryChip } from '../../components/category-chip/category-chip';
import { ErrorMessage } from '../../components/error-message/error-message';
import { ThingRow } from '../../components/thing-row/thing-row';
import { TermPipe } from '../../pipes/term.pipe';
import { AllThingsSkeleton } from './all-things-skeleton/all-things-skeleton';

@Component({
  selector: 'bt-all-things',
  imports: [
    RouterLink,
    NgIcon,
    AllThingsSkeleton,
    CardGroup,
    CategoryChip,
    ErrorMessage,
    TermPipe,
    ThingRow,
  ],
  viewProviders: [provideIcons({ searchThings })],
  templateUrl: './all-things.page.html',
  styleUrl: './all-things.page.scss',
})
export class AllThingsPage {
  private categoriesStore = inject(CategoriesStore);
  private thingsStore = inject(ThingsStore);
  private collections = loadCollections(this.categoriesStore, this.thingsStore);

  readonly query = signal('');
  readonly categoryId = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(map((params) => params.get('categoryId'))),
    { initialValue: null },
  );

  readonly categories = categoriesView();
  readonly shownCategories = computed(() =>
    this.categories().filter(
      (category) => category.thingCount || category.id === this.categoryId(),
    ),
  );

  readonly hasThings = computed(() => this.thingsStore.entities().length > 0);
  readonly things = computed(() => {
    const categoryId = this.categoryId();
    const text = this.query().trim().toLowerCase();

    return this.thingsStore
      .entities()
      .filter(
        (thing) =>
          (!categoryId || thing.categoryId === categoryId) &&
          (!text || `${thing.name} ${thing.description}`.toLowerCase().includes(text)),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  });

  readonly loaded = this.collections.loaded;
  readonly error = this.collections.error;
  readonly thingsFailed = computed(() => this.thingsStore.status() === 'error');

  retry() {
    this.collections.retry();
  }

  category(id: string) {
    return this.categories().find((c) => c.id === id);
  }
}
