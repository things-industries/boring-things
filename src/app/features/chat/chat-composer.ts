import { Component, input, model, output } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { attachToMessage, sendMessage } from '../../core/app-icons';
import { IconButton } from '../../components/icon-button/icon-button';

/** Message field with a disabled attach button and a send button. Enter sends; Shift+Enter adds a line. */
@Component({
  selector: 'bt-chat-composer',
  imports: [IconButton],
  viewProviders: [provideIcons({ attachToMessage, sendMessage })],
  templateUrl: './chat-composer.html',
  styleUrl: './chat-composer.scss',
})
export class ChatComposer {
  readonly placeholder = input.required<string>();
  readonly disabled = input(false);
  readonly text = model('');
  readonly send = output<void>();

  keydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    this.submit();
  }

  submit() {
    if (!this.disabled() && this.text().trim()) this.send.emit();
  }
}
