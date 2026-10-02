import { Component, input } from '@angular/core';
import type { Schema } from '../../../../shared/model';

/** A user message bubble or an assistant message; `[bubbleMeta]` content follows the content. */
@Component({
  selector: 'bt-chat-bubble',
  template: '<ng-content /><ng-content select="[bubbleMeta]" />',
  styleUrl: './chat-bubble.scss',
  host: { '[class.user]': "role() === 'USER'" },
})
export class ChatBubble {
  readonly role = input.required<Schema['MessageRoleEnum']>();
}
