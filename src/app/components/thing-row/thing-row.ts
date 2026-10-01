import { Component, computed, input } from '@angular/core';
import type { Schema } from '../../../../shared/model';
import { APP_CONFIG } from '../../core/app.config';
import { isNewThing } from '../../utils/date.util';
import { ListRow } from '../list-row/list-row';
import { ThingThumbnail } from '../thing-thumbnail/thing-thumbnail';
/** Thing link row with thumbnail, name, category and New and Sample markers. */
@Component({
  selector: 'bt-thing-row',
  imports: [ListRow, ThingThumbnail],
  templateUrl: './thing-row.html',
  styleUrl: './thing-row.scss',
})
export class ThingRow {
  readonly thing = input.required<Schema['ThingSummary']>();
  readonly category = input<Schema['Category'] | undefined>();
  readonly isNew = computed(() =>
    isNewThing(this.thing().createdAt, new Date(), APP_CONFIG.newThingDays),
  );
}
