import { Component, computed, effect, inject, input, linkedSignal, resource } from '@angular/core';
import type { Schema } from '../../../../shared/model';
import { AttachmentsService } from '../../core/data/attachments.service';
import { attachmentBadge } from '../../utils/attachment.util';
import { IconBadge } from '../icon-badge/icon-badge';
/**
 * Image attachment cropped to an icon badge square, loaded through an authenticated blob URL.
 * Shows the badge background while it loads and the attachment's icon badge if it fails.
 * Decorative: the row beside it names the file. The host registers the badge icons.
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
  private attachments = inject(AttachmentsService);
  readonly attachment = input.required<Schema['Attachment']>();
  readonly badge = computed(() => attachmentBadge(this.attachment()));

  private readonly image = resource({
    params: () => this.attachment().id,
    loader: ({ params }) => this.attachments.blob(params),
  });

  private readonly broken = linkedSignal({
    source: () => this.attachment().id,
    computation: () => false,
  });

  readonly failed = computed(() => this.broken() || !!this.image.error());

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

  markBroken() {
    this.broken.set(true);
  }
}
