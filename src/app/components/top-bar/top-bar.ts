import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import { back } from '../../core/app-icons';
import { IconButton } from '../icon-button/icon-button';
/**
 * Page bar with an optional back link, centred title and trailing projected actions, such as a
 * `bt-menu`. It sits above a `bt-scroll-container` in a `viewport-page`. Set
 * `--top-bar-background` to match the page behind it.
 */
@Component({
  selector: 'bt-top-bar',
  imports: [RouterLink, IconButton],
  viewProviders: [provideIcons({ back })],
  templateUrl: './top-bar.html',
  styleUrl: './top-bar.scss',
})
export class TopBar {
  readonly title = input<string>();
  readonly back = input<string | unknown[] | null>(null);
  readonly backLabel = input('Back');
  readonly backVariant = input<'surface' | 'elevated' | 'plain' | 'accent'>('surface');
}
