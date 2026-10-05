import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { APP_CONFIG } from '../../core/app.config';

/**
 * Text that types in character by character when `animate` is true at creation. Assistive
 * technology reads the full text from the start, and untyped characters keep their space so the
 * layout does not move. With reduced motion the text shows at once. Emits `typed` when complete.
 */
@Component({
  selector: 'bt-typewriter',
  template: `<span class="visually-hidden">{{ text() }}</span
    ><span aria-hidden="true"
      >{{ typedText() }}<span class="typewriter-rest">{{ restText() }}</span></span
    >`,
  styleUrl: './typewriter.scss',
})
export class Typewriter implements OnInit {
  readonly text = input.required<string>();
  readonly animate = input(true);
  readonly typed = output();

  private readonly count = signal<number | null>(null);

  readonly typedText = computed(() => this.text().slice(0, this.count() ?? Infinity));

  readonly restText = computed(() => this.text().slice(this.count() ?? Infinity));

  private timer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
  }

  ngOnInit() {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!this.animate() || reduced) {
      this.typed.emit();
      return;
    }

    this.count.set(0);
    this.timer = setInterval(() => {
      const next = (this.count() ?? 0) + 1;

      this.count.set(next);
      if (next < this.text().length) return;
      clearInterval(this.timer);
      this.count.set(null);
      this.typed.emit();
    }, APP_CONFIG.typewriterCharMs);
  }
}
