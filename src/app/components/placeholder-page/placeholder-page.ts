import { Component, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { ScrollContainer } from '../scroll-container/scroll-container';
import { TopBar } from '../top-bar/top-bar';
/** Page for destinations that are not built yet. The host registers `icon` with `provideIcons`. */
@Component({
  selector: 'bt-placeholder-page',
  imports: [NgIcon, ScrollContainer, TopBar],
  templateUrl: './placeholder-page.html',
  styleUrl: './placeholder-page.scss',
})
export class PlaceholderPage {
  readonly title = input.required<string>();
  readonly icon = input.required<string>();
  readonly back = input<string | unknown[] | null>(null);
}
