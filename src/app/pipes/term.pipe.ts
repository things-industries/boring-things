import { Pipe, type PipeTransform } from '@angular/core';
import { APP_TERMS } from '../core/app-terms';
@Pipe({ name: 'term' })
export class TermPipe implements PipeTransform {
  transform(key: keyof typeof APP_TERMS) {
    return APP_TERMS[key];
  }
}
