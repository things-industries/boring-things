import { Component, computed, effect, inject, input, output, resource } from '@angular/core';
import type { Schema } from '../../../../shared/model';
import { AttachmentsService } from '../../core/data/attachments.service';

/**
 * Image attachment loaded through an authenticated blob URL, at most as wide as its container.
 * Shows a skeleton while loading and emits `failed` when the content cannot be loaded.
 */
@Component({
  selector: 'bt-attachment-image',
  templateUrl: './attachment-image.html',
  styleUrl: './attachment-image.scss',
})
export class AttachmentImage {
  private attachments = inject(AttachmentsService);
  readonly attachment = input.required<Schema['Attachment']>();
  readonly failed = output();

  private readonly image = resource({
    params: () => this.attachment().id,
    loader: ({ params }) => this.attachments.blob(params),
  });

  readonly imageUrl = computed(() =>
    this.image.hasValue() ? URL.createObjectURL(this.image.value()) : '',
  );

  constructor() {
    // Revokes each object URL once it is replaced or the image is destroyed.
    effect((onCleanup) => {
      const url = this.imageUrl();

      onCleanup(() => {
        if (url) URL.revokeObjectURL(url);
      });
    });

    effect(() => {
      if (this.image.status() === 'error') this.failed.emit();
    });
  }
}
