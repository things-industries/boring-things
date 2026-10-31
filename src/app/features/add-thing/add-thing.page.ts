import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  addManually,
  chooseFile,
  choosePhoto,
  connectMailbox,
  forwardEmail,
  pasteText,
  privacyNotice,
  setupNotice,
  takePhoto,
} from '../../core/app-icons';
import { CONFIG } from '../../core/runtime-config';
import { ThingsStore } from '../../core/state/things.store';
import { Notice } from '../../components/notice/notice';
import { OptionTile } from '../../components/option-tile/option-tile';
import { ScrollContainer } from '../../components/scroll-container/scroll-container';
import { TopBar } from '../../components/top-bar/top-bar';
import { TermPipe } from '../../pipes/term.pipe';

@Component({
  selector: 'bt-add-thing',
  imports: [RouterLink, NgIcon, Notice, OptionTile, ScrollContainer, TopBar, TermPipe],
  viewProviders: [
    provideIcons({
      addManually,
      chooseFile,
      choosePhoto,
      connectMailbox,
      forwardEmail,
      pasteText,
      privacyNotice,
      setupNotice,
      takePhoto,
    }),
  ],
  templateUrl: './add-thing.page.html',
  styleUrl: './add-thing.page.scss',
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
    const files = Array.from(input.files ?? []);

    input.value = '';
    if (!files.length || this.busy()) return;
    this.busy.set(true);

    const result = await this.things.startImport(files);

    if (result.ok) await this.router.navigate(['/imports', result.value.importId]);
    else this.busy.set(false);
  }
}
