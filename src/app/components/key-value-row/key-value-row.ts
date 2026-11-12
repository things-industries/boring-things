import {
  booleanAttribute,
  Component,
  type ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { NgIcon } from '@ng-icons/core';
import { APP_CONFIG } from '../../core/app.config';
import { Toasts } from '../../core/services/toasts.service';
/**
 * Key/value row with an optional icon, a label and a projected value; `loading` shows a skeleton in
 * place of the value. `[keyValueStart]` content precedes the label, `[keyValueLabel]` content
 * follows it and `[keyValueEnd]` content follows the value. With `copyable`, choosing the row
 * copies the value as displayed, without the label. With `editing`, the value takes the room a
 * projected editor needs; with `stacked`, it takes a row of its own under the label. The host
 * registers `icon` with `provideIcons`.
 */
@Component({
  selector: 'bt-key-value-row',
  imports: [NgIcon],
  templateUrl: './key-value-row.html',
  styleUrl: './key-value-row.scss',
  host: {
    '[class.is-copyable]': 'copyable()',
    '[class.is-editing]': 'editing()',
    '[class.is-stacked]': 'stacked()',
  },
})
export class KeyValueRow {
  private toasts = inject(Toasts);
  private value = viewChild<ElementRef<HTMLElement>>('value');
  readonly label = input.required<string>();
  readonly icon = input<string | null>(null);
  readonly loading = input(false);
  readonly copyable = input(false, { transform: booleanAttribute });
  readonly editing = input(false, { transform: booleanAttribute });
  readonly stacked = input(false, { transform: booleanAttribute });
  readonly copied = signal(false);

  async copy() {
    const value = this.value()?.nativeElement.textContent?.replace(/\s+/g, ' ').trim() ?? '';

    try {
      await navigator.clipboard.writeText(value);
    } catch {
      this.toasts.error('copyDetails', 'request-failed');
      return;
    }

    this.copied.set(true);
    setTimeout(() => this.copied.set(false), APP_CONFIG.copiedMs);
  }
}
