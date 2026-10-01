import { Component, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
export type IconBadgeTone = 'info' | 'accent' | 'warning' | 'neutral' | 'white';
/** Circular tinted icon. The host registers `icon` with `provideIcons`. */
@Component({
  selector: 'bt-icon-badge',
  imports: [NgIcon],
  template: `<ng-icon [name]="icon()" aria-hidden="true" />`,
  styleUrl: './icon-badge.scss',
  host: { '[class]': "'tone-' + tone()" },
})
export class IconBadge {
  readonly icon = input.required<string>();
  readonly tone = input<IconBadgeTone>('neutral');
}
