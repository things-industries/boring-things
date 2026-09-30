import { Component, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { TopBar } from '../top-bar/top-bar';
/** Page for destinations that are not built yet. The host registers `icon` with `provideIcons`. */
@Component({
  selector: 'bt-placeholder-page',
  imports: [NgIcon, TopBar],
  templateUrl: './placeholder-page.html',
  styleUrl: './placeholder-page.scss',
})
export class PlaceholderPage {
  readonly title = input.required<string>();
  readonly icon = input.required<string>();
  readonly back = input<string | unknown[] | null>(null);
}
