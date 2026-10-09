import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import type { Schema } from '../../../../shared/model';
import {
  addTag,
  askQuestion,
  attachmentFile,
  attachmentGuide,
  attachmentImage,
  attachmentInvoice,
  attachmentManual,
  attachmentReceipt,
  attachmentSpecification,
  changeCategory,
  compatibleProduct,
  complete,
  deleteItem,
  downloadAttachment,
  allDetails,
  editDetails,
  editTags,
  extractDetails,
  fieldIcons,
  issueFault,
  issueOther,
  issueRenewal,
  issueWarranty,
  linkAttachment,
  moreActions,
  resolveIssue,
  setAsImage,
  taskCleaning,
  taskInspection,
  taskOther,
  taskRepair,
  taskReplacement,
  taskService,
  unlinkAttachment,
  upcomingEvent,
  uploadFile,
  scheduleTask,
} from '../../core/app-icons';
import { APP_CONFIG } from '../../core/app.config';
import { AttachmentsService } from '../../core/data/attachments.service';
import { mockIssueKinds } from '../../core/mocks/issue-kind.mock';
import { CONFIG } from '../../core/runtime-config';
import { errorCode } from '../../utils/error.util';
import { Toasts } from '../../core/services/toasts.service';
import { AttachmentsStore } from '../../core/state/attachments.store';
import { CategoriesStore } from '../../core/state/categories.store';
import { ConversationsStore } from '../../core/state/conversations.store';
import { EventsStore } from '../../core/state/events.store';
import { TasksStore } from '../../core/state/tasks.store';
import { IssuesStore } from '../../core/state/issues.store';
import { PurchasablesStore } from '../../core/state/purchasables.store';
import { TagsStore } from '../../core/state/tags.store';
import { ThingsStore } from '../../core/state/things.store';
import { AttachmentThumbnail } from '../../components/attachment-thumbnail/attachment-thumbnail';
import { Dialog } from '../../components/dialog/dialog';
import { ErrorMessage } from '../../components/error-message/error-message';
import { EventCard } from '../../components/event-card/event-card';
import { Hero } from '../../components/hero/hero';
import { IconButton } from '../../components/icon-button/icon-button';
import { KeyValueRow } from '../../components/key-value-row/key-value-row';
import { ListRow } from '../../components/list-row/list-row';
import { Menu } from '../../components/menu/menu';
import { MenuItem } from '../../components/menu/menu-item';
import { Notice } from '../../components/notice/notice';
import { SectionHeader } from '../../components/section-header/section-header';
import { ScrollContainer } from '../../components/scroll-container/scroll-container';
import { Sheet } from '../../components/sheet/sheet';
import { TopBar } from '../../components/top-bar/top-bar';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';
import { daysUntil, eventStart } from '../../utils/date.util';
import { attachmentBadge, attachmentFormat } from '../../utils/attachment.util';
import { taskBadges } from '../../utils/event.util';
import { formatFieldValue } from '../../utils/field.util';
import { issueBadges } from '../../utils/issue.util';
import { ImportProgress } from './import-progress/import-progress';
import { ImportSteps } from './import-steps/import-steps';
import { ImportSources } from './import-sources/import-sources';
import { routeThing } from './thing-loader';
import { RowSkeleton } from './row-skeleton/row-skeleton';
import { ThingSkeleton } from './thing-skeleton/thing-skeleton';
import { activeImport, discovering, fieldValueById, keyDetails } from './thing.view';

type ThingDialog = 'sources' | 'category' | 'tags' | 'delete' | 'link' | 'deleteFile';

/** A Thing's image, status, key details, tasks, products and attachments. */
@Component({
  selector: 'bt-thing',
  imports: [
    DatePipe,
    FormsModule,
    NgIcon,
    RouterLink,
    Dialog,
    ErrorMessage,
    EventCard,
    Hero,
    IconButton,
    ImportProgress,
    ImportSteps,
    ImportSources,
    KeyValueRow,
    ListRow,
    AttachmentThumbnail,
    Menu,
    MenuItem,
    Notice,
    RelativeTimePipe,
    RowSkeleton,
    ScrollContainer,
    SectionHeader,
    Sheet,
    ThingSkeleton,
    TopBar,
  ],
  viewProviders: [
    provideIcons({
      addTag,
      askQuestion,
      attachmentFile,
      attachmentGuide,
      attachmentImage,
      attachmentInvoice,
      attachmentManual,
      attachmentReceipt,
      attachmentSpecification,
      changeCategory,
      compatibleProduct,
      complete,
      deleteItem,
      downloadAttachment,
      allDetails,
      editDetails,
      editTags,
      extractDetails,
      ...fieldIcons,
      issueFault,
      issueOther,
      issueRenewal,
      issueWarranty,
      linkAttachment,
      moreActions,
      resolveIssue,
      setAsImage,
      taskCleaning,
      taskInspection,
      taskOther,
      taskRepair,
      taskReplacement,
      taskService,
      unlinkAttachment,
      upcomingEvent,
      uploadFile,
      scheduleTask,
    }),
  ],
  templateUrl: './thing.page.html',
  styleUrl: './thing.page.scss',
})
export class ThingPage {
  private things = inject(ThingsStore);
  private categories = inject(CategoriesStore);
  private tagsStore = inject(TagsStore);
  private issues = inject(IssuesStore);
  private events = inject(EventsStore);
  private tasks = inject(TasksStore);
  private attachments = inject(AttachmentsStore);
  private purchasablesStore = inject(PurchasablesStore);
  private conversations = inject(ConversationsStore);
  private files = inject(AttachmentsService);
  private toasts = inject(Toasts);
  private router = inject(Router);
  private current = routeThing();
  private sheet = viewChild(Sheet, { read: ElementRef<HTMLElement> });

  readonly config = inject(CONFIG);
  readonly id = this.current.id;
  readonly thing = this.current.thing;
  readonly detail = this.current.detail;
  readonly loaded = this.current.loaded;
  readonly missing = this.current.missing;
  readonly error = this.current.error;
  readonly disconnected = this.current.disconnected;
  readonly sheetAtTop = signal(false);
  readonly daysUntil = daysUntil;
  readonly attachmentBadge = attachmentBadge;
  readonly attachmentFormat = attachmentFormat;
  readonly taskBadges = taskBadges;
  readonly formatValue = formatFieldValue;

  readonly issueBadges = issueBadges;

  readonly category = computed<Schema['Category'] | null>(
    () => this.categories.entityMap()[this.thing()?.categoryId ?? ''] ?? null,
  );

  readonly allCategories = this.categories.entities;
  readonly tags = this.tagsStore.sorted;
  readonly job = computed(() => this.detail()?.import ?? null);
  readonly processing = computed(() => activeImport(this.job()));

  readonly discovering = computed(() => {
    const detail = this.detail();

    return !!detail && discovering(detail, this.thing()?.imageAttachmentId ?? null);
  });

  /** The Thing this visit saw discovering, so its sheet slides up as details arrive. */
  private discoveredId = signal<string | null>(null);
  readonly sheetArrives = computed(() => this.discoveredId() === this.id());

  readonly showImport = computed(() => {
    const job = this.job();

    return !!job && (job.status !== 'COMPLETE' || job.thingIds.length > 1);
  });

  readonly model = computed(() => {
    const detail = this.detail();
    const value = detail ? fieldValueById(detail, 'common.model') : null;

    return typeof value === 'string' ? value : null;
  });

  readonly keyDetails = computed(() => {
    const detail = this.detail();

    return detail ? keyDetails(detail) : [];
  });

  readonly openIssues = computed(() =>
    mockIssueKinds(
      (this.issues.issuesByThing()[this.id()] ?? []).filter((issue) => issue.status === 'OPEN'),
    ),
  );

  private readonly thingEvents = computed(() => this.events.eventsByThing()[this.id()] ?? []);

  readonly scheduled = computed(() =>
    this.thingEvents()
      .filter((event) => event.status === 'SCHEDULED')
      .sort((a, b) => (eventStart(a) ?? 0) - (eventStart(b) ?? 0)),
  );

  readonly suggested = computed(() =>
    (this.tasks.tasksByThing()[this.id()] ?? []).filter((task) => task.status === 'SUGGESTED'),
  );

  readonly purchasables = computed(
    () => this.purchasablesStore.purchasablesByThing()[this.id()] ?? [],
  );

  readonly linkedFiles = computed(() => this.attachments.attachmentsByThing()[this.id()] ?? []);

  readonly library = computed(() =>
    this.attachments.entities().filter((file) => !file.thingIds.includes(this.id())),
  );

  readonly dialog = signal<ThingDialog | null>(null);
  readonly target = signal<string | null>(null);
  readonly categoryDraft = signal('');
  readonly newTag = signal('');
  readonly copied = signal(false);
  private viewed = new Set<string>();

  constructor() {
    void this.categories.ensureLoaded();
    void this.issues.ensureLoaded();
    void this.events.ensureLoaded();
    void this.attachments.ensureLoaded();

    effect(() => {
      const id = this.id();

      untracked(() => void this.purchasablesStore.loadForThing(id));
    });

    // Loads the Thing's latest chat so opening it shows saved messages without waiting.
    effect(() => {
      const id = this.id();

      if (this.config.chatEnabled) untracked(() => this.conversations.preload(id));
    });

    // Records one view per visit once the Thing has loaded.
    effect(() => {
      const id = this.id();

      if (!this.thing() || this.viewed.has(id)) return;
      this.viewed.add(id);
      untracked(() => void this.things.view(id));
    });

    effect(() => {
      if (this.discovering()) this.discoveredId.set(this.id());
    });
  }

  /** Tracks whether the sheet has scrolled up to the top bar. */
  scrolled(event: Event) {
    const sheet = this.sheet()?.nativeElement;

    this.sheetAtTop.set(!!sheet && (event.target as HTMLElement).scrollTop >= sheet.offsetTop);
  }

  retry() {
    this.current.retry();
  }

  open(dialog: ThingDialog, target: string | null = null) {
    this.target.set(target);
    if (dialog === 'category') this.categoryDraft.set(this.thing()?.categoryId ?? '');
    this.dialog.set(dialog);
  }

  closeDialog() {
    this.dialog.set(null);
    this.target.set(null);
  }

  async copyDetails() {
    const lines = this.keyDetails()
      .filter((row) => !row.masked && row.value !== null)
      .map(
        (row) =>
          `${row.label}: ${typeof row.value === 'boolean' ? (row.value ? 'Yes' : 'No') : formatFieldValue(row.value)}`,
      );

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
    } catch {
      this.toasts.error('copyDetails', 'request-failed');
      return;
    }

    this.copied.set(true);
    setTimeout(() => this.copied.set(false), APP_CONFIG.copiedMs);
  }

  resolve(id: string) {
    void this.issues.resolve(id);
  }

  /** Completes a task, which may create its next occurrence, or an appointment. */
  complete(id: string) {
    void (this.tasks.entityMap()[id] ? this.tasks.complete(id) : this.events.complete(id));
  }

  /** Adds a suggested task to the schedule; the day is chosen for the owner. */
  addTask(id: string) {
    void this.tasks.add(id);
  }

  saveCategory() {
    const categoryId = this.categoryDraft();

    if (categoryId && categoryId !== this.thing()?.categoryId)
      void this.things.update(this.id(), { categoryId });
    this.closeDialog();
  }

  toggleTag(tagId: string) {
    const ids = this.thing()?.tagIds ?? [];

    void this.things.update(this.id(), {
      tagIds: ids.includes(tagId) ? ids.filter((id) => id !== tagId) : [...ids, tagId],
    });
  }

  async addTag() {
    const name = this.newTag().trim();

    if (!name) return;
    this.newTag.set('');

    const result = await this.tagsStore.create(name);

    if (result.ok)
      void this.things.update(this.id(), {
        tagIds: [...(this.thing()?.tagIds ?? []), result.value.id],
      });
  }

  remove() {
    const id = this.id();

    this.closeDialog();
    void this.things.remove(id);
    void this.router.navigate(['/']);
  }

  upload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    input.value = '';
    if (file) void this.attachments.upload(file, this.id());
  }

  async download(file: Schema['Attachment']) {
    try {
      await this.files.download(file);
    } catch (e) {
      this.toasts.error('downloadFile', errorCode(e));
    }
  }

  setImage(attachmentId: string | null) {
    void this.things.update(this.id(), { imageAttachmentId: attachmentId });
  }

  unlink(attachmentId: string) {
    void this.attachments.unlink(attachmentId, this.id());
  }

  link(attachmentId: string) {
    void this.attachments.link(attachmentId, this.id());
  }

  deleteFile() {
    const id = this.target();

    if (!id) return;

    const file = this.attachments.entityMap()[id];

    if (file?.thingIds.length) void this.attachments.discard(id, this.id());
    else void this.attachments.remove(id);
    this.closeDialog();
  }
}
