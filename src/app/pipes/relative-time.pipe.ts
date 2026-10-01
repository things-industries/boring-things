import { LOCALE_ID, Pipe, inject, type PipeTransform } from '@angular/core';
import { relativeDistance } from '../utils/date.util';
/** Formats a date or instant relative to today, such as "tomorrow" or "in 3 weeks". */
@Pipe({ name: 'relativeTime' })
export class RelativeTimePipe implements PipeTransform {
  private format = new Intl.RelativeTimeFormat(inject(LOCALE_ID), { numeric: 'auto' });
  transform(value: string) {
    const { amount, unit } = relativeDistance(value);
    return this.format.format(amount, unit);
  }
}
