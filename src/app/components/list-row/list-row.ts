import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { openRow } from '../../core/app-icons';
import { IconBadge, type IconBadgeTone } from '../icon-badge/icon-badge';
/**
 * Row with a leading icon badge or projected `[rowLeading]`, a title, projected `[rowSubtitle]` and
 * `[rowTrailing]`. With `link`, the title link covers the row and a chevron ends it.
 * The host registers `icon` with `provideIcons`.
 */
@Component({
  selector: 'bt-list-row',
  imports: [RouterLink, NgIcon, IconBadge],
  viewProviders: [provideIcons({ openRow })],
  templateUrl: './list-row.html',
  styleUrl: './list-row.scss',
})
export class ListRow {
  readonly title = input.required<string>();
  readonly icon = input<string | null>(null);
  readonly tone = input<IconBadgeTone>('neutral');
  readonly link = input<string | unknown[] | null>(null);
}
