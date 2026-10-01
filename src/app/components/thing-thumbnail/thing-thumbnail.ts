import { Component, computed, effect, inject, input, resource } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { categoryIcons } from '../../core/app-icons';
import { AttachmentsService } from '../../core/data/attachments.service';
import { categoryIcon } from '../../utils/category.util';
/** Thing image loaded through an authenticated blob URL, or its category icon when there is none. */
@Component({
  selector: 'bt-thing-thumbnail',
  imports: [NgIcon],
  viewProviders: [provideIcons(categoryIcons)],
  templateUrl: './thing-thumbnail.html',
  styleUrl: './thing-thumbnail.scss',
  host: { '[class]': "'size-' + size()" },
})
export class ThingThumbnail {
  private attachments = inject(AttachmentsService);
  readonly imageId = input<string | null>(null);
  readonly category = input<string | null>(null);
  readonly size = input<'sm' | 'md'>('md');
  readonly categoryIcon = categoryIcon;

  private readonly image = resource({
    params: () => this.imageId() ?? undefined,
    loader: ({ params }) => this.attachments.blob(params),
  });

  readonly imageUrl = computed(() =>
    this.image.hasValue() ? URL.createObjectURL(this.image.value()) : '',
  );

  constructor() {
    // Revokes each object URL once it is replaced or the thumbnail is destroyed.
    effect((onCleanup) => {
      const url = this.imageUrl();

      onCleanup(() => {
        if (url) URL.revokeObjectURL(url);
      });
    });
  }
}
