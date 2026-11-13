import {
  Component,
  computed,
  effect,
  inject,
  Injector,
  afterNextRender,
  linkedSignal,
  signal,
} from '@angular/core';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { provideIcons } from '@ng-icons/core';
import type { Schema, Value } from '../../../../../shared/model';
import {
  close,
  complete,
  deleteItem,
  editDetails,
  hideValue,
  issueFault,
  moreDetails,
  pinField,
  pinnedField,
  revealValue,
  unpinField,
} from '../../../core/app-icons';
import { CategoriesStore } from '../../../core/state/categories.store';
import { ThingsStore } from '../../../core/state/things.store';
import { CardGroup } from '../../../components/card-group/card-group';
import { Dialog } from '../../../components/dialog/dialog';
import { ErrorMessage } from '../../../components/error-message/error-message';
import { FieldControl } from '../../../components/field-control/field-control';
import { IconButton } from '../../../components/icon-button/icon-button';
import { KeyValueRow } from '../../../components/key-value-row/key-value-row';
import { Menu } from '../../../components/menu/menu';
import { Notice } from '../../../components/notice/notice';
import { MenuItem } from '../../../components/menu/menu-item';
import { ScrollContainer } from '../../../components/scroll-container/scroll-container';
import { SectionHeader } from '../../../components/section-header/section-header';
import { TopBar } from '../../../components/top-bar/top-bar';
import type { FieldInput } from '../../../interfaces/field-input.interface';
import type { LeaveGuarded } from '../../../interfaces/leave-guarded.interface';
import { formatFieldValue, valueDraft } from '../../../utils/field.util';
import { samePin } from '../../../utils/sections.util';
import { activeImport } from '../thing.view';
import {
  type DetailRow,
  descriptionInput,
  detailGroups,
  detailsDraft,
  detailsPatches,
  nameInput,
} from './thing-details.view';
import { type DetailsForm, changedDraft, detailsForm } from './thing-details.edit';
import { routeThing } from '../thing-loader';
import { RowSkeleton } from '../row-skeleton/row-skeleton';

/**
 * Every detail of a Thing in grouped cards, with pin, reveal and delete actions per row. Edit mode
 * turns every value into an inline control and saves the changes together.
 */
@Component({
  selector: 'bt-thing-details',
  imports: [
    DatePipe,
    NgTemplateOutlet,
    RouterLink,
    CardGroup,
    Dialog,
    ErrorMessage,
    FieldControl,
    IconButton,
    KeyValueRow,
    Menu,
    MenuItem,
    Notice,
    ReactiveFormsModule,
    RowSkeleton,
    ScrollContainer,
    SectionHeader,
    TopBar,
  ],
  viewProviders: [
    provideIcons({
      close,
      complete,
      deleteItem,
      editDetails,
      hideValue,
      issueFault,
      moreDetails,
      pinField,
      pinnedField,
      revealValue,
      unpinField,
    }),
  ],
  templateUrl: './thing-details.page.html',
  styleUrl: './thing-details.page.scss',
  host: { '(window:beforeunload)': 'warnBeforeUnload($event)' },
})
export class ThingDetailsPage implements LeaveGuarded {
  private things = inject(ThingsStore);
  private categories = inject(CategoriesStore);
  private route = inject(ActivatedRoute);
  private injector = inject(Injector);
  private current = routeThing();

  readonly id = this.current.id;
  readonly thing = this.current.thing;
  readonly detail = this.current.detail;
  readonly loaded = this.current.loaded;
  readonly missing = this.current.missing;
  readonly error = this.current.error;
  readonly processing = computed(() => activeImport(this.detail()?.import));
  readonly formatValue = formatFieldValue;

  /** Whether a row shows a value to copy: recorded, and revealed when sensitive. */
  copyable(row: DetailRow) {
    const revealed = this.revealed();

    return revealed.has(row.anchor)
      ? revealed.get(row.anchor) !== null
      : row.value !== null && !row.masked;
  }

  readonly category = computed<string | null>(
    () => this.categories.entityMap()[this.thing()?.categoryId ?? '']?.name ?? null,
  );

  readonly groups = computed(() => {
    const detail = this.detail();

    return detail ? detailGroups(detail) : [];
  });

  // A computed source, so only a new revision clears revealed values, not every snapshot.
  private revision = computed(() => this.thing()?.revision);

  /** Revealed values by row anchor, cleared whenever the Thing changes. */
  readonly revealed = linkedSignal<number | undefined, ReadonlyMap<string, Value | null>>({
    source: this.revision,
    computation: () => new Map(),
  });

  readonly revealing = signal<string | null>(null);
  readonly deleting = signal<DetailRow | null>(null);

  readonly nameInput = nameInput;
  readonly descriptionInput = descriptionInput;

  readonly categoryInput = computed<FieldInput>(() => ({
    kind: 'select',
    sensitive: false,
    required: true,
    options: this.categories.entities().map((c) => ({ value: c.id, label: c.name })),
  }));

  /** The edit form while editing; `null` while viewing. */
  readonly form = signal<DetailsForm | null>(null);

  /** Sensitive rows whose typed value is visible while editing. */
  readonly shown = signal<ReadonlySet<string>>(new Set());

  /** Answers the open "Discard changes?" dialog; `null` while it is closed. */
  readonly discarding = signal<((discard: boolean) => void) | null>(null);

  constructor() {
    void this.categories.ensureLoaded();

    let scrolled = false;

    // Scrolls to a linked field once its section has rendered.
    effect(() => {
      if (!this.detail() || scrolled) return;
      scrolled = true;
      afterNextRender(
        () => {
          const fragment = this.route.snapshot.fragment;

          if (fragment) document.getElementById(fragment)?.scrollIntoView({ block: 'center' });
        },
        { injector: this.injector },
      );
    });
  }

  retry() {
    this.current.retry();
  }

  startEdit() {
    const thing = this.thing();

    if (!thing || this.processing()) return;
    this.shown.set(new Set(this.revealed().keys()));
    this.form.set(detailsForm(detailsDraft(thing, this.rows(), this.revealed()), this.rows()));
  }

  /** Leaves edit mode, first confirming when there are unsaved edits. */
  async requestCancel() {
    if (!this.form()?.dirty || (await this.confirmDiscard())) this.endEdit();
  }

  /** Confirms before navigation discards unsaved edits. */
  async canLeave() {
    if (!this.form()?.dirty) return true;

    const discard = await this.confirmDiscard();

    if (discard) this.endEdit();
    return discard;
  }

  answerDiscard(discard: boolean) {
    const answer = this.discarding();

    this.discarding.set(null);
    answer?.(discard);
  }

  /** Asks the browser to confirm reloading or closing the tab with unsaved edits. */
  warnBeforeUnload(event: BeforeUnloadEvent) {
    if (this.form()?.dirty) event.preventDefault();
  }

  /** Saves every changed value and leaves edit mode, or points at the first invalid value. */
  save() {
    const form = this.form();
    const thing = this.thing();
    const detail = this.detail();

    if (!form || !thing || !detail) return;

    if (form.invalid) {
      form.markAllAsTouched();
      afterNextRender(
        () =>
          document.querySelector<HTMLElement>('bt-field-control [aria-invalid="true"]')?.focus(),
        { injector: this.injector },
      );
      return;
    }

    const patches = detailsPatches(thing, this.rows(), changedDraft(form), this.revealed());

    this.endEdit();
    void this.send(patches);
  }

  /** Reveals or hides a sensitive value while editing, fetching it when it is masked. */
  async toggleShown(row: DetailRow) {
    if (this.shown().has(row.anchor)) {
      this.shown.update((set) => new Set([...set].filter((anchor) => anchor !== row.anchor)));
      return;
    }

    if (row.masked && !this.revealed().has(row.anchor)) {
      await this.toggleReveal(row);
      if (!this.revealed().has(row.anchor)) return;

      const control = this.form()?.controls.fields.controls[row.anchor];

      if (control?.pristine)
        control.setValue(valueDraft(row.input, this.revealed().get(row.anchor) ?? null));
    }

    this.shown.update((set) => new Set(set).add(row.anchor));
  }

  togglePin(row: DetailRow) {
    const pins = this.detail()?.pinnedFields ?? [];

    void this.things.update(this.id(), {
      pinnedFields: row.pinned ? pins.filter((p) => !samePin(p, row.pin)) : [...pins, row.pin],
    });
  }

  async toggleReveal(row: DetailRow) {
    if (this.revealed().has(row.anchor)) return this.hide(row.anchor);
    this.revealing.set(row.anchor);

    const revision = this.thing()?.revision;
    const value = await this.things.reveal(this.id(), row.pin);

    this.revealing.set(null);
    if (value === undefined || this.thing()?.revision !== revision) return;
    this.revealed.update((map) => new Map(map).set(row.anchor, value));
  }

  confirmDelete() {
    const row = this.deleting();

    if (!row) return;
    this.hide(row.anchor);
    this.deleting.set(null);
    void this.things.update(this.id(), row.remove);
  }

  /** Leaves edit mode and masks every value revealed again. */
  private endEdit() {
    this.form.set(null);
    this.shown.set(new Set());
    this.revealed.set(new Map());
  }

  private confirmDiscard() {
    return new Promise<boolean>((resolve) => this.discarding.set(resolve));
  }

  private readonly rows = computed(() => this.groups().flatMap((group) => group.rows));

  /** Sends each patch after the previous one succeeds; a failure has already reverted and toasted. */
  private async send(patches: Schema['ThingPatch'][]) {
    for (const patch of patches) {
      const result = await this.things.update(this.id(), patch);

      if (!result.ok) return;
    }
  }

  private hide(anchor: string) {
    this.revealed.update((map) => {
      const next = new Map(map);

      next.delete(anchor);
      return next;
    });
  }
}
