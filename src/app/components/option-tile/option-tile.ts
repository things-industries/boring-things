import { Component, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
/** Icon and label tile on a native `button` or `a`. The host registers `icon` with `provideIcons`. */
@Component({
  selector: 'button[btOptionTile], a[btOptionTile]',
  imports: [NgIcon],
  template: `<ng-icon [name]="icon()" aria-hidden="true" /><span>{{ label() }}</span>`,
  styleUrl: './option-tile.scss',
})
export class OptionTile {
  readonly icon = input.required<string>();
  readonly label = input.required<string>();
}
