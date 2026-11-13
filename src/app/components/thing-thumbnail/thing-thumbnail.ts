import {
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  resource,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import type { Schema } from '../../../../shared/model';
import { categoryIcons } from '../../core/app-icons';
import { ImageCache } from '../../core/services/image-cache.service';
import { categoryIcon } from '../../utils/category.util';
/**
 * Thing image, category artwork or category icon. `ready` emits when the image loads or the icon appears.
 */
@Component({
  selector: 'bt-thing-thumbnail',
  imports: [NgIcon],
  viewProviders: [provideIcons(categoryIcons)],
  templateUrl: './thing-thumbnail.html',
  styleUrl: './thing-thumbnail.scss',
  host: { '[class]': "'size-' + size()" },
})
export class ThingThumbnail {
  private images = inject(ImageCache);
  readonly imageId = input<string | null>(null);
  readonly category = input<Schema['Category'] | null>(null);
  readonly size = input<'sm' | 'md' | 'fill'>('md');
  readonly ready = output();
  readonly categoryIcon = categoryIcon;

  private readonly image = resource({
    params: () => this.imageId() ?? undefined,
    loader: ({ params }) => this.images.load(params),
  });

  private readonly broken = linkedSignal({ source: this.imageId, computation: () => false });
  private readonly defaultImage = computed(() => this.category()?.defaultImage ?? null);
  private readonly brokenDefault = linkedSignal({
    source: this.defaultImage,
    computation: () => false,
  });

  readonly imageUrl = computed(() => {
    const id = this.imageId();

    if (!id || this.broken()) return '';
    return this.images.peek(id) ?? (this.image.hasValue() ? this.image.value() : '');
  });

  private readonly showFallback = computed(
    () => !this.imageId() || this.broken() || !!this.image.error(),
  );
  readonly fallbackUrl = computed(() =>
    this.showFallback() && !this.brokenDefault() ? this.defaultImage() : null,
  );
  readonly showIcon = computed(() => this.showFallback() && !this.fallbackUrl());

  constructor() {
    effect(() => {
      if (this.showIcon()) this.ready.emit();
    });
  }

  /** Moves to the next fallback when the browser cannot display the image. */
  markBroken(useDefault: boolean) {
    (useDefault ? this.brokenDefault : this.broken).set(true);
  }
}
