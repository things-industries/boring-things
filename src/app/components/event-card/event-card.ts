import { Component, input } from '@angular/core';
import { DateTile } from '../date-tile/date-tile';
import { ListRow } from '../list-row/list-row';
import type { IconBadgeTone } from '../../interfaces/icon-badge.interface';
/**
 * Highlighted Event row led by a date tile, or by an icon badge when `date` is empty.
 * Projected `[rowSubtitle]` and `[rowTrailing]` pass through to the row.
 */
@Component({
  selector: 'bt-event-card',
  imports: [DateTile, ListRow],
  templateUrl: './event-card.html',
  styleUrl: './event-card.scss',
})
export class EventCard {
  readonly title = input.required<string>();
  readonly date = input<string | null>(null);
  readonly icon = input<string | null>(null);
  readonly tone = input<IconBadgeTone>('white');
  readonly link = input<string | unknown[] | null>(null);
}
