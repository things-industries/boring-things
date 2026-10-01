import { Component, computed, input } from '@angular/core';
/** Placeholder list rows or key/value rows while a section's content is on its way. */
@Component({
  selector: 'bt-row-skeleton',
  templateUrl: './row-skeleton.html',
  styleUrl: './row-skeleton.scss',
  host: { 'aria-hidden': 'true', '[class]': 'kind()' },
})
export class RowSkeleton {
  readonly kind = input<'list' | 'key-value'>('list');
  readonly rows = input(3);
  readonly items = computed(() => Array.from({ length: this.rows() }, (_, index) => index));
}
