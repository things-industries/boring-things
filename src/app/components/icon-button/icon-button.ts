import { Component, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
/** Round icon-only control on a native `button` or `a`. The host registers `icon` with `provideIcons`. */
@Component({
  selector: 'button[btIconButton], a[btIconButton]',
  imports: [NgIcon],
  template: `<ng-icon [name]="icon()" aria-hidden="true" />`,
  styleUrl: './icon-button.scss',
  host: {
    '[attr.aria-label]': 'label()',
    '[class.elevated]': "variant() === 'elevated'",
    '[class.plain]': "variant() === 'plain'",
    '[class.accent]': "variant() === 'accent'",
    '[class.primary]': "variant() === 'primary'",
    '[class.small]': "size() === 'sm'",
  },
})
export class IconButton {
  readonly icon = input.required<string>();
  readonly label = input.required<string>();
  readonly variant = input<'surface' | 'elevated' | 'plain' | 'accent' | 'primary'>('surface');
  readonly size = input<'md' | 'sm'>('md');
}
