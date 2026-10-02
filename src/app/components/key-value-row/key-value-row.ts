import { Component, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';
/**
 * Key/value row with an optional icon, a label and a projected value; `loading` shows a skeleton in
 * place of the value. `[keyValueLabel]` content follows the label and `[keyValueEnd]` content
 * follows the value. The host registers `icon` with `provideIcons`.
 */
@Component({
  selector: 'bt-key-value-row',
  imports: [NgIcon],
  templateUrl: './key-value-row.html',
  styleUrl: './key-value-row.scss',
})
export class KeyValueRow {
  readonly label = input.required<string>();
  readonly icon = input<string | null>(null);
  readonly loading = input(false);
}
