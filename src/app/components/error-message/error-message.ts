import { Component, input } from '@angular/core';
import type { UiErrorCode } from '../../interfaces/error.interface';
@Component({
  selector: 'bt-error-message',
  templateUrl: './error-message.html',
  styleUrl: './error-message.scss',
})
export class ErrorMessage {
  readonly code = input<UiErrorCode | null>(null);
}
