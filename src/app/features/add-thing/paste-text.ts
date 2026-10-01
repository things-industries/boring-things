import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { privacyNotice } from '../../core/app-icons';
import { ThingsStore } from '../../core/state/things.store';
import { Notice } from '../../components/notice/notice';
import { ScrollContainer } from '../../components/scroll-container/scroll-container';
import { TopBar } from '../../components/top-bar/top-bar';

@Component({
  selector: 'bt-paste-text',
  imports: [FormsModule, Notice, ScrollContainer, TopBar],
  viewProviders: [provideIcons({ privacyNotice })],
  templateUrl: './paste-text.html',
  styleUrl: './paste-text.scss',
})
export class PasteTextPage {
  private things = inject(ThingsStore);
  private router = inject(Router);

  readonly text = signal('');
  readonly busy = signal(false);

  async submit() {
    const text = this.text().trim();

    if (!text || this.busy()) return;
    this.busy.set(true);

    const result = await this.things.startImport(
      new File([text], 'pasted-text.txt', { type: 'text/plain' }),
    );

    if (result.ok) await this.router.navigate(['/things', result.value.thingId]);
    else this.busy.set(false);
  }
}
