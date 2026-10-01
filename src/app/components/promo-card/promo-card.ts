import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon } from '@ng-icons/core';
/** Dark call-to-action card linking to `link`. The host registers `icon` with `provideIcons`. */
@Component({
  selector: 'bt-promo-card',
  imports: [RouterLink, NgIcon],
  templateUrl: './promo-card.html',
  styleUrl: './promo-card.scss',
})
export class PromoCard {
  readonly title = input.required<string>();
  readonly icon = input.required<string>();
  readonly link = input.required<string | unknown[]>();
}
