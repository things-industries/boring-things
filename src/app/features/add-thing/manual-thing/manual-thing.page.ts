import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CategoriesStore } from '../../../core/state/categories.store';
import { loadCollections } from '../../../core/state/load-collections';
import { RegistryStore } from '../../../core/state/registry.store';
import { ThingsStore } from '../../../core/state/things.store';
import { ErrorMessage } from '../../../components/error-message/error-message';
import { ScrollContainer } from '../../../components/scroll-container/scroll-container';
import { TopBar } from '../../../components/top-bar/top-bar';

@Component({
  selector: 'bt-manual-thing',
  imports: [FormsModule, ErrorMessage, ScrollContainer, TopBar],
  templateUrl: './manual-thing.page.html',
  styleUrl: './manual-thing.page.scss',
})
export class ManualThingPage {
  private things = inject(ThingsStore);
  private categoriesStore = inject(CategoriesStore);
  private registry = inject(RegistryStore);
  private router = inject(Router);
  private collections = loadCollections(this.categoriesStore, this.registry);

  readonly categories = this.categoriesStore.entities;
  readonly loaded = this.collections.loaded;
  readonly error = this.collections.error;
  readonly name = signal('');
  readonly description = signal('');
  readonly categoryId = signal('other');
  readonly fieldSetId = signal('');
  readonly busy = signal(false);

  readonly fieldSets = computed(() =>
    this.registry.fieldSets().filter((set) => set.categoryId === this.categoryId()),
  );

  retry() {
    this.collections.retry();
  }

  chooseCategory(id: string) {
    this.categoryId.set(id);
    this.fieldSetId.set('');
  }

  async save() {
    if (!this.name().trim() || this.busy()) return;
    this.busy.set(true);

    const result = await this.things.create({
      name: this.name(),
      description: this.description(),
      categoryId: this.categoryId(),
      addFieldSetIds: this.fieldSetId() ? [this.fieldSetId()] : [],
    });

    if (result.ok) await this.router.navigate(['/things', result.value.id]);
    else this.busy.set(false);
  }
}
