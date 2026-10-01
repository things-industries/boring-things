import { Component, computed, input } from '@angular/core';
import { ERROR_TERMS } from '../../core/app-terms';
import type { UiErrorCode } from '../../interfaces/error.interface';

@Component({
  selector: 'bt-error-message',
  templateUrl: './error-message.html',
  styleUrl: './error-message.scss',
})
export class ErrorMessage {
  readonly code = input<UiErrorCode | null>(null);
  readonly message = computed(() => {
    const code = this.code();

    return code ? ERROR_TERMS[code] : '';
  });
}
