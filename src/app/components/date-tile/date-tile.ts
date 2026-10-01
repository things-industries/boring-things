import { Component, input } from '@angular/core';
import { DatePipe, UpperCasePipe } from '@angular/common';
/** Day and month tile for a calendar date or instant. */
@Component({
  selector: 'bt-date-tile',
  imports: [DatePipe, UpperCasePipe],
  templateUrl: './date-tile.html',
  styleUrl: './date-tile.scss',
})
export class DateTile {
  readonly date = input.required<string>();
}
