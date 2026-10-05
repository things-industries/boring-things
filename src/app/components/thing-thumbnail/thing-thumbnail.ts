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
import { categoryIcons } from '../../core/app-icons';
import { ImageCache } from '../../core/services/image-cache.service';
import { categoryIcon } from '../../utils/category.util';
/**
 * Thing image loaded through an authenticated blob URL, or its category icon when there is none or
 * the image fails to load. While the image loads it shows only its background. Images loaded earlier
 * in the session show at once. `ready` emits when the image has loaded, or when the icon shows.
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
  readonly category = input<string | null>(null);
  readonly size = input<'sm' | 'md' | 'fill'>('md');
  readonly ready = output();
  readonly categoryIcon = categoryIcon;

  private readonly image = resource({
    params: () => this.imageId() ?? undefined,
    loader: ({ params }) => this.images.load(params),
  });

  /** The image content loaded but could not be shown. */
  readonly broken = linkedSignal({ source: this.imageId, computation: () => false });

  readonly imageUrl = computed(() => {
    const id = this.imageId();

    if (!id || this.broken()) return '';
    return this.images.peek(id) ?? (this.image.hasValue() ? this.image.value() : '');
  });

  readonly showIcon = computed(
    () => !this.imageUrl() && (!this.imageId() || this.broken() || !!this.image.error()),
  );

  constructor() {
    effect(() => {
      if (this.showIcon()) this.ready.emit();
    });
  }
}
