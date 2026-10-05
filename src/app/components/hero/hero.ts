import { Component, input, linkedSignal } from '@angular/core';
import { ThingThumbnail } from '../thing-thumbnail/thing-thumbnail';
/**
 * Thing image, or category artwork, under a scrim, fixed at the top of a `viewport-page` behind
 * its top bar and scrolling content. Projected content is centred below the top bar.
 * `discovering` fills the page with the scrim and no image. `arrive` animates the image or artwork
 * in for a Thing that has just finished discovering: the image stays hidden until it has loaded,
 * then animates, and artwork animates when it shows.
 */
@Component({
  selector: 'bt-hero',
  imports: [ThingThumbnail],
  templateUrl: './hero.html',
  styleUrl: './hero.scss',
  host: {
    '[class.discovering]': 'discovering()',
    '[class.arrive]': 'arrive()',
    '[class.ready]': 'ready()',
  },
})
export class Hero {
  readonly imageId = input<string | null>(null);
  readonly category = input<string | null>(null);
  readonly discovering = input(false);
  readonly arrive = input(false);
  /** The image has loaded, or the artwork shows. */
  readonly ready = linkedSignal({ source: this.imageId, computation: () => false });
}
