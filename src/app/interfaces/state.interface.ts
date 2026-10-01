import type { Signal } from '@angular/core';
import type { UiErrorCode } from './error.interface';

export type LoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

export type MutationResult<R> = { ok: true; value: R } | { ok: false; code: UiErrorCode };

/** A store with `withLoad` status, as pages see it. */
export interface LoadableStore {
  status: Signal<LoadStatus>;
  error: Signal<UiErrorCode | null>;
  ensureLoaded(): Promise<void>;
  reload(): Promise<void>;
}
