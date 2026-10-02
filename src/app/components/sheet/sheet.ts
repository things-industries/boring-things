import { booleanAttribute, Component, input } from '@angular/core';
/**
 * White sheet that scrolls over the `bt-hero` behind it and fills the rest of the page.
 * `arrive` slides it up into place when it first renders. `flat` squares its top corners, for when it
 * has scrolled up to the top bar.
 */
@Component({
  selector: 'bt-sheet',
  template: '<ng-content />',
  styleUrl: './sheet.scss',
  host: { '[class.arrive]': 'arrive()', '[class.flat]': 'flat()' },
})
export class Sheet {
  readonly arrive = input(false);
  readonly flat = input(false, { transform: booleanAttribute });
}
