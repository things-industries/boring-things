import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { NgIcon, provideIcons } from '@ng-icons/core';
import type { Schema } from '../../../../shared/model';
import {
  attachmentFile,
  attachmentGuide,
  attachmentImage,
  attachmentInvoice,
  attachmentManual,
  attachmentReceipt,
  attachmentSpecification,
  compatibleProduct,
  complete,
  downloadAttachment,
  fieldIcons,
  issueFault,
  issueOther,
  issueRenewal,
  issueWarranty,
  savedDocument,
  scheduleTask,
  taskCleaning,
  taskInspection,
  taskOther,
  taskRepair,
  taskReplacement,
  taskService,
  upcomingEvent,
} from '../../core/app-icons';
import { AttachmentsService } from '../../core/data/attachments.service';
import { mockEventRecurrence } from '../../core/mocks/event-recurrence.mock';
import { mockIssueKinds } from '../../core/mocks/issue-kind.mock';
import { mockSavedDocument } from '../../core/mocks/saved-document.mock';
import { Toasts } from '../../core/services/toasts.service';
import { AttachmentsStore } from '../../core/state/attachments.store';
import { CategoriesStore } from '../../core/state/categories.store';
import { EventsStore } from '../../core/state/events.store';
import { IssuesStore } from '../../core/state/issues.store';
import { PurchasablesStore } from '../../core/state/purchasables.store';
import { ThingsStore } from '../../core/state/things.store';
import { EventCard } from '../../components/event-card/event-card';
import { IconButton } from '../../components/icon-button/icon-button';
import { KeyValueRow } from '../../components/key-value-row/key-value-row';
import { ListRow } from '../../components/list-row/list-row';
import { ThingCard } from '../../components/thing-card/thing-card';
import type { UiErrorCode } from '../../interfaces/error.interface';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';
import { errorCode } from '../../utils/error.util';
import { fieldIcon } from '../../utils/field-icon.util';
import { formatFieldValue } from '../../utils/field.util';
import { attachmentBadge, attachmentFormat, issueBadges, taskBadges } from '../things/thing.view';

type CardStatus = 'idle' | 'loading' | 'missing' | 'error';

/** A record referenced by an assistant message, read from its store and loaded when missing. */
@Component({
  selector: 'bt-resource-card',
  imports: [
    DatePipe,
    NgIcon,
    EventCard,
    IconButton,
    KeyValueRow,
    ListRow,
    RelativeTimePipe,
    ThingCard,
  ],
  viewProviders: [
    provideIcons({
      attachmentFile,
      attachmentGuide,
      attachmentImage,
      attachmentInvoice,
      attachmentManual,
      attachmentReceipt,
      attachmentSpecification,
      compatibleProduct,
      complete,
      downloadAttachment,
      ...fieldIcons,
      issueFault,
      issueOther,
      issueRenewal,
      issueWarranty,
      savedDocument,
      scheduleTask,
      taskCleaning,
      taskInspection,
      taskOther,
      taskRepair,
      taskReplacement,
      taskService,
      upcomingEvent,
    }),
  ],
  templateUrl: './resource-card.html',
  styleUrl: './resource-card.scss',
})
export class ResourceCard {
  private things = inject(ThingsStore);
  private categories = inject(CategoriesStore);
  private attachments = inject(AttachmentsStore);
  private events = inject(EventsStore);
  private issues = inject(IssuesStore);
  private purchasables = inject(PurchasablesStore);
  private files = inject(AttachmentsService);
  private toasts = inject(Toasts);

  readonly card = input.required<Schema['ResourceCard']>();
  readonly schedule = output<Schema['Event']>();
  readonly status = signal<CardStatus>('idle');
  readonly attachmentBadge = attachmentBadge;
  readonly attachmentFormat = attachmentFormat;
  readonly issueBadges = issueBadges;
  readonly taskBadges = taskBadges;
  readonly fieldIcon = fieldIcon;
  readonly formatValue = formatFieldValue;

  readonly thing = computed(() => {
    const card = this.card();

    return card.type === 'THING' || card.type === 'FIELD'
      ? (this.things.entityMap()[card.thingId] ?? null)
      : null;
  });

  readonly category = computed(
    () => this.categories.entityMap()[this.thing()?.categoryId ?? ''] ?? null,
  );

  readonly field = computed(() => {
    const card = this.card();
    const detail = this.thing()?.detail;

    if (card.type !== 'FIELD' || !detail) return null;
    return (
      (card.fieldSetId
        ? detail.fieldSets.find((set) => set.id === card.fieldSetId)?.fields
        : detail.standaloneFields
      )?.find((field) => field.id === card.fieldId) ?? null
    );
  });

  readonly file = computed(() => {
    const card = this.card();

    return card.type === 'ATTACHMENT'
      ? (this.attachments.entityMap()[card.attachmentId] ?? null)
      : null;
  });

  readonly saved = computed(() => mockSavedDocument(this.card()));

  readonly event = computed(() => {
    const card = this.card();
    const event = card.type === 'EVENT' ? this.events.entityMap()[card.eventId] : undefined;

    return event ? mockEventRecurrence(event) : null;
  });

  readonly issue = computed(() => {
    const card = this.card();
    const issue = card.type === 'ISSUE' ? this.issues.entityMap()[card.issueId] : undefined;

    return issue ? mockIssueKinds([issue])[0] : null;
  });

  readonly purchasable = computed(() => {
    const card = this.card();

    return card.type === 'PURCHASABLE'
      ? (this.purchasables.entityMap()[card.purchasableId] ?? null)
      : null;
  });

  /** Whether the card's record is in its store, with details for a field card. */
  private readonly present = computed(() => {
    const card = this.card();

    if (card.type === 'THING') return !!this.thing();
    if (card.type === 'FIELD') return !!this.thing()?.detail;
    if (card.type === 'ATTACHMENT') return !!this.file();
    if (card.type === 'EVENT') return !!this.event();
    if (card.type === 'ISSUE') return !!this.issue();
    return !!this.purchasable();
  });

  readonly unavailable = computed(
    () =>
      this.card().available === false ||
      this.status() === 'missing' ||
      (this.card().type === 'FIELD' && this.present() && !this.field()),
  );

  constructor() {
    void this.categories.ensureLoaded();

    effect(() => {
      const card = this.card();

      untracked(() => void this.load(card));
    });
  }

  async load(card: Schema['ResourceCard']) {
    if (card.available === false || this.present()) return;
    this.status.set('loading');

    const code = await this.fetch(card);

    if (card !== this.card()) return;
    this.status.set(code === null ? 'idle' : code === 'not-found' ? 'missing' : 'error');
  }

  private fetch(card: Schema['ResourceCard']): Promise<UiErrorCode | null> {
    switch (card.type) {
      case 'THING':
      case 'FIELD':
        return this.things.loadOne(card.thingId);
      case 'ATTACHMENT':
        return this.attachments.loadOne(card.attachmentId);
      case 'EVENT':
        return this.events.loadOne(card.eventId);
      case 'ISSUE':
        return this.issues.loadOne(card.issueId);
      case 'PURCHASABLE':
        return this.purchasables.loadOne(card.purchasableId);
    }
  }

  resolve(id: string) {
    void this.issues.resolve(id);
  }

  complete(id: string) {
    void this.events.complete(id);
  }

  async download(file: Schema['Attachment']) {
    try {
      await this.files.download(file);
    } catch (e) {
      this.toasts.error('downloadFile', errorCode(e));
    }
  }
}
