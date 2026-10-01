import { Component, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { loading } from '../../core/app-icons';
/**
 * Tinted banner. The host registers `icon` with `provideIcons`; `busy` replaces it with a spinner.
 * Hosts add `role="status"` when the notice changes live, since the spinner is decorative.
 */
@Component({
  selector: 'bt-notice',
  imports: [NgIcon],
  viewProviders: [provideIcons({ loading })],
  templateUrl: './notice.html',
  styleUrl: './notice.scss',
  host: { '[class]': "'tone-' + tone()" },
})
export class Notice {
  readonly tone = input<'info' | 'accent' | 'warning' | 'danger'>('info');
  readonly icon = input<string | null>(null);
  readonly busy = input(false);
}
