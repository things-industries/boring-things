import { Component, inject, input, signal } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import type { Schema } from '../../../../../shared/model';
import { setupNotice } from '../../../core/app-icons';
import { ThingsStore } from '../../../core/state/things.store';
import { Notice } from '../../../components/notice/notice';
import { ImportSteps } from '../import-steps/import-steps';

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

  readonly job = input.required<Schema['Import']>();
  readonly busy = signal(false);

  async retry() {
    if (this.busy()) return;
    this.busy.set(true);
    await this.things.retryImport(this.job().id);
    this.busy.set(false);
  }
}
