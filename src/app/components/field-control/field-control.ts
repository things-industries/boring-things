import {
  Component,
  DestroyRef,
  type ElementRef,
  type OnInit,
  type WritableSignal,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { type ControlValueAccessor, NgControl } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { editDetails, expandSection, moneyField, rescheduleTask } from '../../core/app-icons';
import { APP_CONFIG } from '../../core/app.config';
import { ERROR_TERMS } from '../../core/app-terms';
import type { UiErrorCode } from '../../interfaces/error.interface';
import type {
  Currency,
  FieldDraft,
  FieldInput,
  MoneyDraft,
} from '../../interfaces/field-input.interface';
import { formatMoneyDraft } from '../../utils/field.util';

let measureContext: CanvasRenderingContext2D | null | undefined;

const sizesToContent = typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content');

/**
 * Sets a textarea's height to its text where CSS `field-sizing` can't. Collapsing it to measure
 * shrinks the page for a moment, so scroll positions are restored afterwards.
 */
function growToText(element: HTMLTextAreaElement) {
  const scrolled: [Element, number][] = [];

  for (let parent = element.parentElement; parent; parent = parent.parentElement)
    if (parent.scrollTop) scrolled.push([parent, parent.scrollTop]);

  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight}px`;
  for (const [parent, top] of scrolled) parent.scrollTop = top;
}

/** The rendered width of `text` in `element`'s font. */
function textWidth(element: HTMLElement, text: string) {
  measureContext ??= document.createElement('canvas').getContext('2d');
  if (!measureContext) return Infinity;
  measureContext.font = getComputedStyle(element).font;
  return measureContext.measureText(text).width;
}

/**
 * Inline value editor for a form control, with the native control suited to `field.kind`, a
 * pencil, card, calendar or chevron inside text, money, date and choice controls, and the control's first error
 * once touched.
 * The value is a `FieldDraft`: text, or an amount and currency for money. `concealed` hides typed
 * text for sensitive values.
 *
 * Text grows in an auto-resizing textarea. `long` turns on when the text no longer fits on one line
 * beside the label, so the host row can give it a row of its own, and off once it would fit again.
 */
@Component({
  selector: 'bt-field-control',
  imports: [NgIcon],
  viewProviders: [provideIcons({ editDetails, expandSection, moneyField, rescheduleTask })],
  templateUrl: './field-control.html',
  styleUrl: './field-control.scss',
  host: {
    '[class.is-invalid]': '!!error()',
    '[class.is-empty]': 'empty()',
    '[class.has-affordance]': '!!affordance()',
    '[class.is-long]': 'long()',
  },
})
export class FieldControl implements ControlValueAccessor, OnInit {
  private ngControl = inject(NgControl, { self: true, optional: true });
  private destroyRef = inject(DestroyRef);

  readonly field = input.required<FieldInput>();
  readonly label = input.required<string>();
  readonly placeholder = input('');
  readonly concealed = input(false);

  readonly currencies = APP_CONFIG.currencies;
  readonly errorTerms = ERROR_TERMS;
  readonly draft = signal<FieldDraft>('');
  readonly disabled = signal(false);
  readonly error = signal<UiErrorCode | null>(null);

  /** Whether the text needs a row of its own. */
  readonly long = signal(false);

  /**
   * The text and amount shown when the inputs render. Typing never writes them back, since
   * rewriting a number input mid-entry ("12.") resets its text and caret.
   */
  readonly inputText = signal('');
  readonly amountText = signal('');

  /** Whether the input holds text the browser can't read as a number or date. */
  private unreadable = false;

  private textArea = viewChild<ElementRef<HTMLTextAreaElement>>('textArea');
  private valueInput = viewChild<ElementRef<HTMLInputElement>>('valueInput');
  private amountInput = viewChild<ElementRef<HTMLInputElement>>('amountInput');

  /** The text width that fits beside the label, measured when the text first wrapped there. */
  private inlineWidth = 0;

  readonly text = computed(() => {
    const draft = this.draft();

    return typeof draft === 'string' ? draft : '';
  });

  readonly money = computed<MoneyDraft>(() => {
    const draft = this.draft();

    return typeof draft === 'object' ? draft : { amount: '', currency: APP_CONFIG.defaultCurrency };
  });

  readonly empty = computed(() => {
    const draft = this.draft();

    return typeof draft === 'string' ? !draft : !draft.amount;
  });

  readonly type = computed(() => {
    if (this.concealed()) return 'password';

    switch (this.field().kind) {
      case 'email':
        return 'email';
      case 'number':
        return 'number';
      case 'date':
        return 'date';
      case 'date-time':
        return 'datetime-local';
      default:
        return 'text';
    }
  });

  readonly inputMode = computed(() => {
    const field = this.field();

    if (field.kind === 'email') return 'email';
    if (field.kind === 'number') return field.integer ? 'numeric' : 'decimal';
    return null;
  });

  /** The kind of native control rendered. */
  readonly control = computed(() => {
    const kind = this.field().kind;

    if (kind === 'money' || kind === 'boolean' || kind === 'select')
      return this.concealed() ? 'concealed-choice' : kind;
    return (kind === 'text' || kind === 'textarea') && !this.concealed() ? 'multiline' : 'input';
  });

  /**
   * A trailing hint inside the control: a pencil for text, a card for money, a calendar or chevron
   * for pickers.
   */
  readonly affordance = computed(() => {
    switch (this.field().kind) {
      case 'text':
      case 'textarea':
      case 'email':
        return 'editDetails';
      case 'money':
        return 'moneyField';
      case 'date':
      case 'date-time':
        return 'rescheduleTask';
      case 'boolean':
      case 'select':
        return 'expandSection';
      default:
        return null;
    }
  });

  private onChange: (value: FieldDraft) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    if (this.ngControl) this.ngControl.valueAccessor = this;

    // A revealed amount input starts from the draft, including edits made before it was hidden.
    effect(() => {
      if (this.amountInput()) untracked(() => this.showAmount(this.money().amount));
    });

    // Fits the textarea after renders and width changes; the observer writes outside the effect.
    effect((onCleanup) => {
      const element = this.textArea()?.nativeElement;

      if (!element) return;

      let frame = 0;
      const observer = new ResizeObserver(() => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => this.fit(element));
      });

      observer.observe(element);
      onCleanup(() => {
        observer.disconnect();
        cancelAnimationFrame(frame);
      });
    });
  }

  ngOnInit() {
    const control = this.ngControl?.control;

    if (!control) return;
    control.addValidators(() => (this.unreadable ? { [this.unreadableError()]: true } : null));
    control.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      const key = control.touched && control.errors ? Object.keys(control.errors)[0] : null;

      this.error.set(key as UiErrorCode | null);
    });
  }

  writeValue(value: FieldDraft | null) {
    this.unreadable = false;
    this.draft.set(value ?? '');
    if (value !== null && typeof value === 'object') this.showAmount(value.amount);
    else this.show(this.inputText, this.valueInput(), value ?? '');
  }

  registerOnChange(fn: (value: FieldDraft) => void) {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void) {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean) {
    this.disabled.set(disabled);
  }

  setText(event: Event) {
    const element = event.target as HTMLInputElement | HTMLTextAreaElement;

    // Single-line text keeps no line breaks, even when pasted.
    if (this.field().kind === 'text' && /[\r\n]/.test(element.value))
      element.value = element.value.replace(/\s*[\r\n]+\s*/g, ' ');

    if (element instanceof HTMLInputElement) this.readable(element);
    this.update(element.value);
    if (element instanceof HTMLTextAreaElement) {
      // Concealing swaps the textarea for an input, which then shows what was typed here.
      this.inputText.set(element.value);
      this.fit(element);
    }
  }

  /** Enter in single-line text does not add a line break. */
  keepSingleLine(event: Event) {
    if (this.field().kind === 'text') event.preventDefault();
  }

  setAmount(event: Event) {
    const element = event.target as HTMLInputElement;

    this.readable(element);
    this.update({ ...this.money(), amount: element.value });
  }

  setCurrency(event: Event) {
    this.update({
      ...this.money(),
      currency: (event.target as HTMLSelectElement).value as Currency,
    });
  }

  /** Shows two decimal places once the amount is left. */
  leaveAmount(event: Event) {
    if (!this.readable(event.target as HTMLInputElement)) return this.onTouched();

    const money = formatMoneyDraft(this.money());

    if (money.amount !== this.money().amount) {
      this.update(money);
      this.showAmount(money.amount);
    }
    this.onTouched();
  }

  touch(event?: Event) {
    if (event?.target instanceof HTMLInputElement) this.readable(event.target);
    this.onTouched();
  }

  /** Opens the date picker from anywhere on a date input, not only its calendar button. */
  openPicker(event: Event) {
    const input = event.target as HTMLInputElement;

    if (input.type !== 'date' && input.type !== 'datetime-local') return;

    try {
      input.showPicker();
    } catch {
      // Browsers without showPicker, or a click that isn't a user gesture, keep the native control.
    }
  }

  /**
   * Records whether a number or date input holds text the browser can't read. Such inputs report an
   * empty value, so the control is revalidated to show an error rather than clear the value.
   */
  private readable(element: HTMLInputElement) {
    const unreadable = element.validity.badInput;

    if (unreadable !== this.unreadable) {
      this.unreadable = unreadable;
      this.ngControl?.control?.updateValueAndValidity();
    }
    return !unreadable;
  }

  private unreadableError(): UiErrorCode {
    switch (this.field().kind) {
      case 'money':
        return 'invalid-money';
      case 'date':
        return 'invalid-date';
      case 'date-time':
        return 'date-required';
      default:
        return 'number-required';
    }
  }

  /** Sizes the textarea to its text and decides whether the text needs its own row. */
  private fit(element: HTMLTextAreaElement) {
    if (!sizesToContent) growToText(element);

    const text = element.value;
    const style = getComputedStyle(element);
    const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);

    if (this.long()) {
      // Leaves slack so text near the edge does not switch back and forth.
      if (!text.includes('\n') && textWidth(element, text) < this.inlineWidth * 0.9)
        this.long.set(false);
      return;
    }

    const paddingY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const line = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.4;

    if (text.includes('\n') || element.scrollHeight - paddingY > line * 1.5) {
      this.inlineWidth = element.clientWidth - paddingX;
      this.long.set(true);
    }
  }

  private showAmount(amount: string) {
    this.show(this.amountText, this.amountInput(), amount);
  }

  /** Shows `text` in an input, writing the element directly when it is already rendered. */
  private show(
    shown: WritableSignal<string>,
    input: ElementRef<HTMLInputElement> | undefined,
    text: string,
  ) {
    shown.set(text);
    if (input && input.nativeElement.value !== text) input.nativeElement.value = text;
  }

  private update(value: FieldDraft) {
    this.draft.set(value);
    this.onChange(value);
  }
}
