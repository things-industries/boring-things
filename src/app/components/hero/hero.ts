import { Component, input } from '@angular/core';
import { ThingThumbnail } from '../thing-thumbnail/thing-thumbnail';
/**
 * Thing image, or category artwork, under a scrim, fixed at the top of a `viewport-page` behind
 * its top bar and scrolling content. Projected content is centred below the top bar.
 * `discovering` fills the page with the scrim and no image.
 */
@Component({
  selector: 'bt-hero',
  imports: [ThingThumbnail],
  templateUrl: './hero.html',
  styleUrl: './hero.scss',
  host: { '[class.discovering]': 'discovering()' },
})
export class Hero {
  readonly imageId = input<string | null>(null);
  readonly category = input<string | null>(null);
  readonly discovering = input(false);
}
