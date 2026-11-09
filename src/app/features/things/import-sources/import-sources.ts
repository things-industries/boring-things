import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import {
  chooseFile,
  choosePhoto,
  pasteText,
  privacyNotice,
  takePhoto,
} from '../../../core/app-icons';
import { CONFIG } from '../../../core/runtime-config';
import { ThingsStore } from '../../../core/state/things.store';
import { Notice } from '../../../components/notice/notice';
import { OptionTile } from '../../../components/option-tile/option-tile';

/** Source choices that add details to a Thing. Emits `started` once an import has begun. */
@Component({
  selector: 'bt-import-sources',
  imports: [FormsModule, Notice, OptionTile],
  viewProviders: [provideIcons({ chooseFile, choosePhoto, pasteText, privacyNotice, takePhoto })],
  templateUrl: './import-sources.html',
  styleUrl: './import-sources.scss',
})
export class ImportSources {
  private things = inject(ThingsStore);
  private router = inject(Router);

  readonly config = inject(CONFIG);
  readonly thingId = input.required<string>();
  readonly started = output<void>();
  readonly busy = signal(false);
  readonly pasting = signal(false);
  readonly text = signal('');

  file(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);

    input.value = '';
    if (files.length) void this.start(files);
  }

  paste() {
    if (this.text().trim())
      void this.start([new File([this.text()], 'pasted-text.txt', { type: 'text/plain' })]);
  }

  private async start(files: File[]) {
    if (this.busy()) return;
    this.busy.set(true);

    const thingId = this.thingId();
    const result = await this.things.startImport(files, thingId);

    this.busy.set(false);
    if (!result.ok) return;
    this.started.emit();
    if (result.value.thingId !== thingId)
      await this.router.navigate(['/imports', result.value.importId]);
  }
}
