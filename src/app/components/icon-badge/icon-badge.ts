import { Component, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import type { IconBadgeTone } from '../../interfaces/icon-badge.interface';
/** Circular tinted icon. The host registers `icon` with `provideIcons`. */
@Component({
  selector: 'bt-icon-badge',
  imports: [NgIcon],
  templateUrl: './icon-badge.html',
  styleUrl: './icon-badge.scss',
  host: { '[class]': "'tone-' + tone()" },
})
export class IconBadge {
  readonly icon = input.required<string>();
  readonly tone = input<IconBadgeTone>('neutral');
}
