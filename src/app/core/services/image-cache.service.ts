import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { APP_CONFIG } from '../app.config';
import { AttachmentsService } from '../data/attachments.service';
import { Auth } from './auth.service';

/**
 * Object URLs for attachment images, kept for the session so a remounted image shows at once.
 * The least recently requested loaded URL is revoked past `APP_CONFIG.imageCacheLimit`, and every URL on sign-out.
 */
@Injectable({ providedIn: 'root' })
export class ImageCache {
  private attachments = inject(AttachmentsService);
  private readonly urls = new Map<string, Promise<string>>();
  private readonly loaded = new Map<string, string>();

  constructor() {
    inject(Auth)
      .sessionChanged.pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((signedIn) => {
        if (!signedIn) this.clear();
      });
  }

  /** The object URL of an image that has already loaded. */
  peek(id: string) {
    return this.loaded.get(id);
  }

  /** Loads the image once and resolves to its object URL. A failed load is not kept. */
  load(id: string) {
    const cached = this.urls.get(id);

    if (cached) {
      this.urls.delete(id);
      this.urls.set(id, cached);
      return cached;
    }

    const url = this.attachments.blob(id).then(
      (blob) => {
        const objectUrl = URL.createObjectURL(blob);

        if (this.urls.get(id) === url) this.loaded.set(id, objectUrl);
        else URL.revokeObjectURL(objectUrl);
        return objectUrl;
      },
      (e: unknown) => {
        if (this.urls.get(id) === url) this.urls.delete(id);
        throw e;
      },
    );

    this.urls.set(id, url);
    this.evict();
    return url;
  }

  private evict() {
    for (const id of this.loaded.keys()) {
      if (this.urls.size <= APP_CONFIG.imageCacheLimit) return;
      this.forget(id);
    }
  }

  private forget(id: string) {
    const url = this.loaded.get(id);

    if (url) URL.revokeObjectURL(url);
    this.loaded.delete(id);
    this.urls.delete(id);
  }

  private clear() {
    for (const id of [...this.urls.keys()]) this.forget(id);
  }
}
