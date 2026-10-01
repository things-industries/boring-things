import { Component, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
/** Tinted metric tile with an icon, a label and a projected value. The host registers `icon`. */
@Component({
  selector: 'bt-status-tile',
  imports: [NgIcon],
  template: `<span class="status-tile-label"
      ><ng-icon [name]="icon()" aria-hidden="true" />{{ label() }}</span
    ><span class="status-tile-value"><ng-content /></span>`,
  styleUrl: './status-tile.scss',
  host: { '[class]': "'tone-' + tone()" },
})
export class StatusTile {
  readonly icon = input.required<string>();
  readonly label = input.required<string>();
  readonly tone = input<'accent' | 'neutral'>('neutral');
}
