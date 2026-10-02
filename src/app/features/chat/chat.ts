import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  Injector,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import type { Schema } from '../../../../shared/model';
import { chatUnavailable, loading, moreActions, responseFailed } from '../../core/app-icons';
import { APP_CONFIG } from '../../core/app.config';
import { AttachmentsService } from '../../core/data/attachments.service';
import { CONFIG } from '../../core/runtime-config';
import { Toasts } from '../../core/services/toasts.service';
import { AttachmentsStore } from '../../core/state/attachments.store';
import { CategoriesStore } from '../../core/state/categories.store';
import { ConversationsStore } from '../../core/state/conversations.store';
import { ThingsStore } from '../../core/state/things.store';
import { ErrorMessage } from '../../components/error-message/error-message';
import { IconButton } from '../../components/icon-button/icon-button';
import { Notice } from '../../components/notice/notice';
import { RichText } from '../../components/rich-text/rich-text';
import { ScheduleDialog } from '../../components/schedule-dialog/schedule-dialog';
import { ScrollContainer } from '../../components/scroll-container/scroll-container';
import { ThingCard } from '../../components/thing-card/thing-card';
import { TopBar } from '../../components/top-bar/top-bar';
import type { UiErrorCode } from '../../interfaces/error.interface';
import { TermPipe } from '../../pipes/term.pipe';
import { errorCode } from '../../utils/error.util';
import { ChatBubble } from './chat-bubble';
import { ChatComposer } from './chat-composer';
import { assistantState, messageCards } from './chat.view';
import { ResourceCard } from './resource-card';

/** A new conversation, global or about the Thing in the route, kept current by its stream. */
@Component({
  selector: 'bt-chat',
  imports: [
    DatePipe,
    ChatBubble,
    ChatComposer,
    ErrorMessage,
    IconButton,
    NgIcon,
    Notice,
    ResourceCard,
    RichText,
    ScheduleDialog,
    ScrollContainer,
    TermPipe,
    ThingCard,
    TopBar,
  ],
  viewProviders: [provideIcons({ chatUnavailable, loading, moreActions, responseFailed })],
  templateUrl: './chat.html',
  styleUrl: './chat.scss',
})
export class ChatPage {
  private conversations = inject(ConversationsStore);
  private things = inject(ThingsStore);
  private categories = inject(CategoriesStore);
  private files = inject(AttachmentsService);
  private toasts = inject(Toasts);
  private attachments = inject(AttachmentsStore);
  private injector = inject(Injector);
  private destroyRef = inject(DestroyRef);
  private scroller = viewChild(ScrollContainer, { read: ElementRef<HTMLElement> });
  private destroyed = false;

  readonly config = inject(CONFIG);
  readonly thingId = inject(ActivatedRoute).snapshot.paramMap.get('id');
  readonly id = signal<string | null>(null);
  readonly starting = signal(false);
  readonly error = signal<UiErrorCode | null>(null);
  readonly sending = signal(false);
  readonly text = signal('');
  readonly scheduling = signal<Schema['Event'] | null>(null);

  readonly conversation = computed(() => {
    const id = this.id();

    return id ? (this.conversations.entityMap()[id] ?? null) : null;
  });

  readonly disconnected = computed(() => {
    const id = this.id();

    return !!id && !!this.conversations.disconnected()[id];
  });

  readonly thing = computed(() =>
    this.thingId ? (this.things.entityMap()[this.thingId] ?? null) : null,
  );

  readonly category = computed(
    () => this.categories.entityMap()[this.thing()?.categoryId ?? ''] ?? null,
  );

  readonly messages = computed(() =>
    (this.conversation()?.messages ?? []).map((message) => ({
      message,
      ...messageCards(message.cards, this.thingId),
    })),
  );

  readonly inFlight = computed(
    () =>
      this.conversation()?.messages.some(
        (m) => m.status === 'QUEUED' || m.status === 'PROCESSING',
      ) ?? false,
  );

  readonly assistantState = computed(() => assistantState(this.conversation()?.messages ?? []));

  /** Request reused when the same text is sent again after a failed or uncertain send. */
  private pending: Schema['MessageInput'] | null = null;

  /** Whether the list follows new messages; false once the user scrolls up. */
  private following = true;

  constructor() {
    this.destroyRef.onDestroy(() => (this.destroyed = true));

    if (this.thingId) {
      void this.categories.ensureLoaded();
      if (!this.things.entityMap()[this.thingId]) void this.things.loadOne(this.thingId);
    }

    // Follows the newest message as messages arrive and stream in.
    effect(() => {
      const last = this.conversation()?.messages.at(-1);

      void last?.text.length;
      untracked(() => {
        if (this.following && last)
          afterNextRender(() => this.toBottom(), { injector: this.injector });
      });
    });

    void this.start();
  }

  async start() {
    if (!this.config.chatEnabled || this.starting()) return;
    this.error.set(null);
    this.starting.set(true);

    const result = await this.conversations.create(this.thingId);

    this.starting.set(false);
    if (this.destroyed) return;
    if (!result.ok) {
      this.error.set(result.code);
      return;
    }

    const id = result.value.id;

    this.destroyRef.onDestroy(this.conversations.watch(id));
    this.id.set(id);
  }

  send() {
    const id = this.id();
    const text = this.text().trim();

    if (!id || !text || this.sending() || this.inFlight()) return;

    const input =
      this.pending?.text === text ? this.pending : { text, requestId: crypto.randomUUID() };

    this.pending = input;
    this.text.set('');
    this.following = true;
    void this.submit(id, input);
  }

  /** Sends the user message of a failed response again with its request ID. */
  retry(message: Schema['Message']) {
    const id = this.id();
    const user = this.conversation()?.messages.find(
      (m) => m.requestId === message.requestId && m.role === 'USER',
    );

    if (!id || !user || this.sending() || this.inFlight()) return;
    this.following = true;
    void this.submit(id, { text: user.text, requestId: message.requestId });
  }

  private async submit(id: string, input: Schema['MessageInput']) {
    this.sending.set(true);

    const result = await this.conversations.send(id, input);

    this.sending.set(false);
    if (result.ok) {
      if (this.pending === input) this.pending = null;
    } else if (this.pending === input && !this.text()) this.text.set(input.text);
  }

  scrolled(event: Event) {
    const el = event.target as HTMLElement;

    this.following = el.scrollHeight - el.scrollTop - el.clientHeight < APP_CONFIG.chatStickPx;
  }

  private toBottom() {
    const el = this.scroller()?.nativeElement;

    if (el) el.scrollTop = el.scrollHeight;
  }

  /** Downloads a cited document. */
  async openSource(attachmentId: string) {
    const code = this.attachments.entityMap()[attachmentId]
      ? null
      : await this.attachments.loadOne(attachmentId);
    const file = this.attachments.entityMap()[attachmentId];

    if (!file) {
      this.toasts.error('downloadFile', code ?? 'not-found');
      return;
    }

    try {
      await this.files.download(file);
    } catch (e) {
      this.toasts.error('downloadFile', errorCode(e));
    }
  }
}
