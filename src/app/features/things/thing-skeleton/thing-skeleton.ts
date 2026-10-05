import { Component } from '@angular/core';
import { RowSkeleton } from '../row-skeleton/row-skeleton';
/** Thing page placeholder shaped like the sheet over an empty `bt-hero`. */
@Component({
  selector: 'bt-thing-skeleton',
  imports: [RowSkeleton],
  templateUrl: './thing-skeleton.html',
  styleUrl: './thing-skeleton.scss',
})
export class ThingSkeleton {}
