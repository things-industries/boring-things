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
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import type { Value } from '../../../../shared/model';
import {
  deleteItem,
  editDetails,
  hideValue,
  moreDetails,
  pinField,
  revealValue,
  unpinField,
} from '../../core/app-icons';
import { CategoriesStore } from '../../core/state/categories.store';
import { ThingsStore } from '../../core/state/things.store';
import { CardGroup } from '../../components/card-group/card-group';
import { Dialog } from '../../components/dialog/dialog';
import { ErrorMessage } from '../../components/error-message/error-message';
import { IconButton } from '../../components/icon-button/icon-button';
import { KeyValueRow } from '../../components/key-value-row/key-value-row';
import { Menu } from '../../components/menu/menu';
import { MenuItem } from '../../components/menu/menu-item';
import { ScrollContainer } from '../../components/scroll-container/scroll-container';
import { SectionHeader } from '../../components/section-header/section-header';
import { TopBar } from '../../components/top-bar/top-bar';
import { formatFieldValue } from '../../utils/field.util';
import { samePin } from '../../utils/sections.util';
import { activeImport } from './thing.view';
import { type DetailRow, detailGroups } from './thing-details.view';
import { routeThing } from './thing-loader';
import { RowSkeleton } from './row-skeleton';

/** Every detail of a Thing in grouped cards, with pin, reveal and delete actions per row. */
@Component({
  selector: 'bt-thing-details',
  imports: [
    DatePipe,
    NgTemplateOutlet,
    RouterLink,
    NgIcon,
    CardGroup,
    Dialog,
    ErrorMessage,
    IconButton,
    KeyValueRow,
    Menu,
    MenuItem,
    RowSkeleton,
    ScrollContainer,
    SectionHeader,
    TopBar,
  ],
  viewProviders: [
    provideIcons({
      deleteItem,
      editDetails,
      hideValue,
      moreDetails,
      pinField,
      revealValue,
      unpinField,
    }),
  ],
  templateUrl: './thing-details.html',
  styleUrl: './thing-details.scss',
})
export class ThingDetailsPage {
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

  readonly category = computed<string | null>(
    () => this.categories.entityMap()[this.thing()?.categoryId ?? '']?.name ?? null,
  );

  readonly groups = computed(() => {
    const detail = this.detail();

    return detail ? detailGroups(detail) : [];
  });

  /** Revealed values by row anchor, cleared whenever the Thing changes. */
  readonly revealed = linkedSignal<number | undefined, ReadonlyMap<string, Value | null>>({
    source: () => this.thing()?.revision,
    computation: () => new Map(),
  });

  readonly revealing = signal<string | null>(null);
  readonly deleting = signal<DetailRow | null>(null);

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

  private hide(anchor: string) {
    this.revealed.update((map) => {
      const next = new Map(map);

      next.delete(anchor);
      return next;
    });
  }
}
