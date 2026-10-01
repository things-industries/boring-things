import { Component, input } from '@angular/core';
/**
 * White sheet that scrolls over the `bt-hero` behind it and fills the rest of the page.
 * `arrive` slides it up into place when it first renders.
 */
@Component({
  selector: 'bt-sheet',
  template: '<ng-content />',
  styleUrl: './sheet.scss',
  host: { '[class.arrive]': 'arrive()' },
})
export class Sheet {
  readonly arrive = input(false);
}
