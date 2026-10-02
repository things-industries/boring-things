import {
  Component,
  ElementRef,
  afterNextRender,
  inject,
  Injector,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { moreActions } from '../../core/app-icons';
import { IconButton } from '../icon-button/icon-button';
/**
 * Icon-button trigger with a popover of projected `[btMenuItem]` items. Arrow keys move between
 * items; Escape, an outside click or choosing an item closes it. The host registers `icon` and
 * item icons; the default `moreActions` icon is registered here.
 */
@Component({
  selector: 'bt-menu',
  imports: [IconButton],
  viewProviders: [provideIcons({ moreActions })],
  templateUrl: './menu.html',
  styleUrl: './menu.scss',
  host: {
    '(document:click)': 'outside($event)',
    '(keydown.escape)': 'close(true)',
  },
})
export class Menu {
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private injector = inject(Injector);
  private trigger = viewChild.required('trigger', { read: ElementRef<HTMLElement> });
  private panel = viewChild<ElementRef<HTMLElement>>('panel');
  readonly icon = input('moreActions');
  readonly label = input.required<string>();
  readonly variant = input<'surface' | 'elevated' | 'plain' | 'accent'>('surface');
  readonly size = input<'md' | 'sm'>('md');
  readonly disabled = input(false);
  readonly open = signal(false);

  toggle() {
    if (this.open()) return this.close();
    this.open.set(true);
    afterNextRender(() => this.items()[0]?.focus(), { injector: this.injector });
  }

  close(restoreFocus = false) {
    if (!this.open()) return;
    this.open.set(false);
    if (restoreFocus) this.trigger().nativeElement.focus();
  }

  outside(event: MouseEvent) {
    if (!this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  move(event: KeyboardEvent) {
    const items = this.items();
    const current = items.indexOf(document.activeElement as HTMLElement);
    const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];

    if (event.key === 'Home') items[0]?.focus();
    else if (event.key === 'End') items.at(-1)?.focus();
    else if (step) items[(current + step + items.length) % items.length]?.focus();
    else if (event.key === 'Tab') this.close();
    else return;
    if (event.key !== 'Tab') event.preventDefault();
  }

  private items() {
    return Array.from(
      this.panel()?.nativeElement.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([disabled])',
      ) ?? [],
    );
  }
}
