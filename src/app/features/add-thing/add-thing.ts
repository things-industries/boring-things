import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import {
  chooseFile,
  choosePhoto,
  pasteText,
  privacyNotice,
  setupNotice,
  takePhoto,
} from '../../core/app-icons';
import { CONFIG } from '../../core/runtime-config';
import { ThingsStore } from '../../core/state/things.store';
import { Notice } from '../../components/notice/notice';
import { OptionTile } from '../../components/option-tile/option-tile';
import { TopBar } from '../../components/top-bar/top-bar';
import { TermPipe } from '../../pipes/term.pipe';

@Component({
  selector: 'bt-add-thing',
  imports: [RouterLink, Notice, OptionTile, TopBar, TermPipe],
  viewProviders: [
    provideIcons({ chooseFile, choosePhoto, pasteText, privacyNotice, setupNotice, takePhoto }),
  ],
  templateUrl: './add-thing.html',
  styleUrl: './add-thing.scss',
})
export class AddThingPage {
  private things = inject(ThingsStore);
  private router = inject(Router);

  readonly config = inject(CONFIG);
  readonly busy = signal(false);
  readonly firstThing = computed(
    () => this.things.status() === 'loaded' && !this.things.entities().length,
  );

  constructor() {
    void this.things.ensureLoaded();
  }

  async file(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    input.value = '';
    if (!file || this.busy()) return;
    this.busy.set(true);

    const result = await this.things.startImport(file);

    if (result.ok) await this.router.navigate(['/things', result.value.thingId]);
    else this.busy.set(false);
  }
}
