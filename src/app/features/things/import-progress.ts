import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import type { Schema } from '../../../../shared/model';
import { setupNotice } from '../../core/app-icons';
import { ThingsStore } from '../../core/state/things.store';
import { Notice } from '../../components/notice/notice';
import { ImportSteps } from './import-steps';
import { activeImport } from './thing.view';

/** A Thing's import progress, its multi-Thing confirmation and retry. */
@Component({
  selector: 'bt-import-progress',
  imports: [FormsModule, RouterLink, ImportSteps, Notice],
  viewProviders: [provideIcons({ setupNotice })],
  templateUrl: './import-progress.html',
  styleUrl: './import-progress.scss',
})
export class ImportProgress {
  private things = inject(ThingsStore);
  private router = inject(Router);

  readonly thingId = input.required<string>();
  readonly job = input.required<Schema['Import']>();
  readonly busy = signal(false);
  readonly active = computed(() => activeImport(this.job()));
  readonly existing = computed(() => this.things.entities().filter((t) => t.id !== this.thingId()));
  readonly selections = signal<Record<string, string>>({});

  constructor() {
    void this.things.ensureLoaded();
  }

  select(candidateId: string, value: string) {
    this.selections.update((selections) => ({ ...selections, [candidateId]: value }));
  }

  async confirm() {
    if (this.busy()) return;
    this.busy.set(true);

    const job = this.job();
    const chosen = this.selections();

    const result = await this.things.confirmImport(job.id, {
      selections: job.candidates
        .filter((candidate) => chosen[candidate.id] !== 'skip')
        .map((candidate) => ({
          candidateId: candidate.id,
          targetThingId: chosen[candidate.id] || null,
        })),
    });

    this.busy.set(false);
    if (result.ok && result.value.thingId && result.value.thingId !== this.thingId())
      await this.router.navigate(['/things', result.value.thingId]);
  }

  async retry() {
    if (this.busy()) return;
    this.busy.set(true);
    await this.things.retryImport(this.job().id);
    this.busy.set(false);
  }
}
