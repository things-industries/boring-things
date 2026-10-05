import { Component, computed, inject, input, linkedSignal, resource } from '@angular/core';
import type { Schema } from '../../../../shared/model';
import { ImageCache } from '../../core/services/image-cache.service';
import { attachmentBadge } from '../../utils/attachment.util';
import { IconBadge } from '../icon-badge/icon-badge';
/**
 * Image attachment cropped to an icon badge square, loaded through `ImageCache`, so images loaded
 * earlier in the session show at once. Shows the badge background while it loads and the
 * attachment's icon badge if it fails. Decorative: the row beside it names the file. The host
 * registers the badge icons.
 */
@Component({
  selector: 'bt-attachment-thumbnail',
  imports: [IconBadge],
  templateUrl: './attachment-thumbnail.html',
  styleUrl: './attachment-thumbnail.scss',
  host: {
    '[class]': "'tone-' + badge().tone",
    '[class.loading]': '!imageUrl() && !failed()',
  },
})
export class AttachmentThumbnail {
  private images = inject(ImageCache);
  readonly attachment = input.required<Schema['Attachment']>();
  readonly badge = computed(() => attachmentBadge(this.attachment()));

  private readonly image = resource({
    params: () => this.attachment().id,
    loader: ({ params }) => this.images.load(params),
  });

  private readonly broken = linkedSignal({
    source: () => this.attachment().id,
    computation: () => false,
  });

  readonly failed = computed(() => this.broken() || !!this.image.error());

  readonly imageUrl = computed(
    () =>
      this.images.peek(this.attachment().id) ?? (this.image.hasValue() ? this.image.value() : ''),
  );

  markBroken() {
    this.broken.set(true);
  }
}
