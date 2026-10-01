import { Component, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
/** Item inside `bt-menu`, on a native `button` or `a`. The host registers `icon`. */
@Component({
  selector: 'button[btMenuItem], a[btMenuItem]',
  imports: [NgIcon],
  template: `@if (icon(); as icon) {
      <ng-icon [name]="icon" aria-hidden="true" />
    }
    <ng-content />`,
  styleUrl: './menu-item.scss',
  host: { role: 'menuitem', tabindex: '-1' },
})
export class MenuItem {
  readonly icon = input<string | null>(null);
}
