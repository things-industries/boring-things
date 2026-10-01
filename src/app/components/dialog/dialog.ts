import { Component, ElementRef, effect, input, output, viewChild } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { close } from '../../core/app-icons';
import { IconButton } from '../icon-button/icon-button';
let nextId = 0;
/**
 * Modal dialog with a title, a close button, projected content and `[dialogActions]`. Content
 * renders only while open. `closed` fires on Escape, a backdrop click or the close button.
 */
@Component({
  selector: 'bt-dialog',
  imports: [IconButton],
  viewProviders: [provideIcons({ close })],
  templateUrl: './dialog.html',
  styleUrl: './dialog.scss',
})
export class Dialog {
  private dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  readonly title = input.required<string>();
  readonly open = input(false);
  readonly closed = output<void>();
  readonly titleId = `dialog-title-${nextId++}`;

  constructor() {
    effect(() => {
      const dialog = this.dialog().nativeElement;

      if (this.open() && !dialog.open) dialog.showModal();
      else if (!this.open() && dialog.open) dialog.close();
    });
  }

  backdrop(event: MouseEvent) {
    if (event.target === this.dialog().nativeElement) this.dialog().nativeElement.close();
  }
}
