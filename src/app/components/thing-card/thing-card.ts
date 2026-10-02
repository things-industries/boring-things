import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Schema } from '../../../../shared/model';
import { ThingThumbnail } from '../thing-thumbnail/thing-thumbnail';

/** Link card with a Thing's thumbnail, name and category, used as chat context. */
@Component({
  selector: 'bt-thing-card',
  imports: [RouterLink, ThingThumbnail],
  templateUrl: './thing-card.html',
  styleUrl: './thing-card.scss',
})
export class ThingCard {
  readonly thing = input.required<Schema['ThingSummary']>();
  readonly category = input<Schema['Category'] | null>(null);
}
