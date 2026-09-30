import { Component, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
/** Round icon-only control on a native `button` or `a`. The host registers `icon` with `provideIcons`. */
@Component({
  selector: 'button[btIconButton], a[btIconButton]',
  imports: [NgIcon],
  templateUrl: './icon-button.html',
  styleUrl: './icon-button.scss',
  host: {
    '[attr.aria-label]': 'label()',
    '[class.elevated]': "variant() === 'elevated'",
  },
})
export class IconButton {
  readonly icon = input.required<string>();
  readonly label = input.required<string>();
  readonly variant = input<'surface' | 'elevated'>('surface');
}
