// Shows persisted Import progress before and after Thing creation.
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { ImportsStore } from '../../core/state/imports.store';
import { Notice } from '../../components/notice/notice';
import { ScrollContainer } from '../../components/scroll-container/scroll-container';
import { TopBar } from '../../components/top-bar/top-bar';

@Component({
  selector: 'bt-import-page',
  imports: [RouterLink, Notice, ScrollContainer, TopBar],
  templateUrl: './import.page.html',
  styleUrl: './import.page.scss',
})
export class ImportPage {
  private route = inject(ActivatedRoute);
  private imports = inject(ImportsStore);

  readonly id = toSignal(this.route.paramMap.pipe(map((params) => params.get('id') ?? '')), {
    requireSync: true,
  });
  readonly job = computed(() => this.imports.records()[this.id()] ?? null);
  readonly reviewCandidates = computed(
    () => this.job()?.candidates.filter((candidate) => candidate.reviewRequired) ?? [],
  );
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly busy = signal(false);

  constructor() {
    effect((onCleanup) => {
      const id = this.id();
      untracked(() => {
        this.loading.set(true);
        this.error.set(false);
        void this.load(id);
      });
      onCleanup(this.imports.watch(id));
    });
  }

  async load(id = this.id()) {
    try {
      await this.imports.loadOne(id);
      this.error.set(false);
    } catch {
      this.error.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  async retry() {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.imports.retry(this.id());
      this.error.set(false);
    } catch {
      this.error.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}
