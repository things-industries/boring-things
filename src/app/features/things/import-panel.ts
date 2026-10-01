import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { Schema } from '../../../../shared/model';
import { CONFIG } from '../../core/runtime-config';
import { ThingsStore } from '../../core/state/things.store';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { takePhoto, choosePhoto, uploadFile } from '../../core/app-icons';
/** Adds details to a Thing from a source, and shows its import's progress, selection and retry. */
@Component({
  selector: 'bt-import-panel',
  imports: [FormsModule, RouterLink, NgIcon],
  viewProviders: [provideIcons({ takePhoto, choosePhoto, uploadFile })],
  templateUrl: './import-panel.html',
  styleUrl: './import-panel.scss',
})
export class ImportPanel {
  private things = inject(ThingsStore);
  private router = inject(Router);
  readonly config = inject(CONFIG);
  thingId = input.required<string>();
  job = input<Schema['Import'] | null>(null);
  changed = output<Schema['Import']>();
  busy = signal(false);
  existing = computed(() => this.things.entities().filter((t) => t.id !== this.thingId()));
  selections: Record<string, string> = {};
  text = '';
  constructor() {
    void this.things.ensureLoaded();
  }
  active() {
    return (
      !!this.job() &&
      ['QUEUED', 'EXTRACTING', 'MAPPING', 'DISCOVERING', 'AWAITING_SELECTION'].includes(
        this.job()!.status,
      )
    );
  }
  async perform(fn: () => Promise<void>) {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await fn();
    } finally {
      this.busy.set(false);
    }
  }
  async file(event: Event) {
    const input = event.target as HTMLInputElement,
      file = input.files?.[0];
    if (file) await this.start(file);
    input.value = '';
  }
  paste() {
    if (this.text.trim())
      void this.start(new File([this.text], 'pasted-text.txt', { type: 'text/plain' }));
  }
  async start(file: File) {
    await this.perform(async () => {
      const thingId = this.thingId();
      const result = await this.things.startImport(file, thingId);
      if (!result.ok) return;
      this.text = '';
      if (result.value.thingId !== thingId)
        await this.router.navigate(['/things', result.value.thingId]);
      else {
        const job = this.things.entityMap()[thingId]?.detail?.import;
        if (job) this.changed.emit(job);
      }
    });
  }
  confirm() {
    const job = this.job();
    if (!job) return;
    void this.perform(async () => {
      const selections = job.candidates
        .filter((c) => this.selections[c.id] !== 'skip')
        .map((c) => ({
          candidateId: c.id,
          targetThingId: this.selections[c.id] || null,
        }));
      const result = await this.things.confirmImport(job.id, { selections });
      if (!result.ok) return;
      this.changed.emit(result.value);
      if (result.value.thingId && result.value.thingId !== this.thingId())
        await this.router.navigate(['/things', result.value.thingId]);
    });
  }
  retry() {
    const job = this.job();
    if (!job) return;
    void this.perform(async () => {
      const result = await this.things.retryImport(job.id);
      if (result.ok) this.changed.emit(result.value);
    });
  }
}
