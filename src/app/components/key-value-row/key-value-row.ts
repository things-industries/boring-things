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
 * place of the value. `[keyValueLabel]` content follows the label and `[keyValueEnd]` content
 * follows the value. With `copyable`, choosing the row copies "Label: value" as displayed. The host
 * registers `icon` with `provideIcons`.
 */
@Component({
  selector: 'bt-key-value-row',
  imports: [NgIcon],
  templateUrl: './key-value-row.html',
  styleUrl: './key-value-row.scss',
  host: { '[class.is-copyable]': 'copyable()' },
})
export class KeyValueRow {
  private toasts = inject(Toasts);
  private value = viewChild<ElementRef<HTMLElement>>('value');
  readonly label = input.required<string>();
  readonly icon = input<string | null>(null);
  readonly loading = input(false);
  readonly copyable = input(false, { transform: booleanAttribute });
  readonly copied = signal(false);

  async copy() {
    const value = this.value()?.nativeElement.textContent?.replace(/\s+/g, ' ').trim() ?? '';

    try {
      await navigator.clipboard.writeText(`${this.label()}: ${value}`);
    } catch {
      this.toasts.error('copyDetails', 'request-failed');
      return;
    }

    this.copied.set(true);
    setTimeout(() => this.copied.set(false), APP_CONFIG.copiedMs);
  }
}
