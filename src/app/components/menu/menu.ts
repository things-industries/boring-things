import { Component, ElementRef, input, signal, viewChild } from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { moreActions } from '../../core/app-icons';
import { IconButton } from '../icon-button/icon-button';

let nextId = 0;

/**
 * Icon-button trigger with a popover of projected `[btMenuItem]` items. The popover sits in the
 * top layer and is anchored to the trigger with CSS anchor positioning. Arrow keys move between
 * items; Escape, an outside click or choosing an item closes it. The host registers `icon` and
 * item icons; the default `moreActions` icon is registered here.
 */
@Component({
  selector: 'bt-menu',
  imports: [IconButton],
  viewProviders: [provideIcons({ moreActions })],
  templateUrl: './menu.html',
  styleUrl: './menu.scss',
  host: { '[style.--menu-anchor]': 'anchor' },
})
export class Menu {
  private panel = viewChild.required<ElementRef<HTMLElement>>('panel');
  private readonly id = nextId++;
  protected readonly panelId = `bt-menu-${this.id}`;
  protected readonly anchor = `--bt-menu-${this.id}`;
  readonly icon = input('moreActions');
  readonly label = input.required<string>();
  readonly variant = input<'surface' | 'elevated' | 'plain' | 'accent'>('surface');
  readonly size = input<'md' | 'sm'>('md');
  readonly disabled = input(false);
  readonly open = signal(false);

  /** Tracks state before the change; `toggle` fires a task later, too late for a quick choice. */
  beforeToggle(event: ToggleEvent) {
    this.open.set(event.newState === 'open');
  }

  toggled(event: ToggleEvent) {
    if (event.newState === 'open') this.items()[0]?.focus();
  }

  close() {
    if (this.open()) this.panel().nativeElement.hidePopover();
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
      this.panel().nativeElement.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'),
    );
  }
}
