import { Component, computed, inject, input, signal } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import type { Schema } from '../../../../shared/model';
import { setupNotice } from '../../core/app-icons';
import { ThingsStore } from '../../core/state/things.store';
import { Notice } from '../../components/notice/notice';
import { ImportSteps } from './import-steps';
import { CONFIG } from '../../core/runtime-config';

/** A Thing's import progress and retry. */
@Component({
  selector: 'bt-import-progress',
  imports: [ImportSteps, Notice],
  viewProviders: [provideIcons({ setupNotice })],
  templateUrl: './import-progress.html',
  styleUrl: './import-progress.scss',
})
export class ImportProgress {
  private things = inject(ThingsStore);
  private config = inject(CONFIG);

  readonly job = input.required<Schema['Import']>();
  readonly busy = signal(false);
  readonly retryable = computed(() =>
    this.job().warnings?.some(
      (warning) =>
        warning.retryable ||
        (warning.code === 'SIZE_LIMIT' && warning.limit !== this.config.maxUploadBytes),
    ),
  );

  async retry() {
    if (this.busy()) return;
    this.busy.set(true);
    await this.things.retryImport(this.job().id);
    this.busy.set(false);
  }
}
