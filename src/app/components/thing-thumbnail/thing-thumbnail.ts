import { Component, effect, inject, input, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { categoryIcons } from '../../core/app-icons';
import { Api } from '../../core/services/api.service';
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
  private api = inject(Api);
  readonly imageId = input<string | null>(null);
  readonly category = input<string | null>(null);
  readonly size = input<'sm' | 'md'>('md');
  readonly imageUrl = signal('');
  readonly categoryIcon = categoryIcon;
  constructor() {
    effect((onCleanup) => {
      const id = this.imageId();
      let url = '';
      let current = true;
      this.imageUrl.set('');
      if (id)
        void this.api
          .blob(id)
          .then((blob) => {
            if (!current) return;
            url = URL.createObjectURL(blob);
            this.imageUrl.set(url);
          })
          .catch(() => undefined);
      onCleanup(() => {
        current = false;
        if (url) URL.revokeObjectURL(url);
      });
    });
  }
}
