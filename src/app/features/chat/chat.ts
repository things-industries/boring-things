import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import type { Schema } from '../../../../shared/model';
import { Api } from '../../core/services/api.service';
import { Auth } from '../../core/services/auth.service';
import { CONFIG } from '../../core/runtime-config';
import { apiData } from '../../core/api/api-client';
import { watchSse } from '../../core/api/thing-stream';
import { errorCode } from '../../utils/error.util';
import type { UiErrorCode } from '../../interfaces/error.interface';
import { ErrorMessage } from '../../components/error-message/error-message';
import { TermPipe } from '../../pipes/term.pipe';
import { ResourceCard } from './resource-card';
import { TopBar } from '../../components/top-bar/top-bar';
@Component({
  selector: 'bt-chat',
  imports: [FormsModule, ErrorMessage, ResourceCard, TermPipe, TopBar],
  templateUrl: './chat.html',
  styleUrl: './chat.scss',
})
export class ChatPage implements OnDestroy {
  private api = inject(Api);
  private auth = inject(Auth);
  readonly config = inject(CONFIG);
  private route = inject(ActivatedRoute);
  private stream = new AbortController();
  conversation = signal<Schema['Conversation'] | null>(null);
  error = signal<UiErrorCode | null>(null);
  busy = signal(false);
  disconnected = signal(false);
  inFlight = computed(
    () =>
      this.conversation()?.messages.some((m) => ['QUEUED', 'PROCESSING'].includes(m.status)) ??
      false,
  );
  readonly thingId = this.route.snapshot.paramMap.get('id');
  text = '';
  // Keep the request ID through uncertain network outcomes as well as server failures.
  private pending: Schema['MessageInput'] | null = null;
  constructor() {
    effect(() => {
      if (!this.auth.signedIn()) {
        this.stream.abort();
        this.conversation.set(null);
      }
    });
    void this.start();
  }
  ngOnDestroy() {
    this.stream.abort();
  }
  async start() {
    if (!this.config.chatEnabled) return;
    this.error.set(null);
    try {
      const thingId = this.thingId;
      const chat = await this.api.client
        .POST('/api/conversations', { body: thingId ? { thingId } : {} })
        .then(apiData);
      if (this.stream.signal.aborted) return;
      this.conversation.set(chat);
      void watchSse(
        () =>
          this.api.client.GET('/api/conversations/{id}/stream', {
            params: { path: { id: chat.id } },
            parseAs: 'stream',
            signal: this.stream.signal,
          }),
        this.stream.signal,
        (event, data) => {
          this.disconnected.set(false);
          if (event === 'conversation.snapshot') {
            const snapshot = data as Schema['Conversation'];
            this.conversation.set(snapshot);
            if (
              this.pending &&
              snapshot.messages.some(
                (m) => m.requestId === this.pending!.requestId && m.role === 'ASSISTANT',
              )
            ) {
              this.pending = null;
              this.text = '';
            }
          } else if (event === 'conversation.delta') {
            const delta = data as Schema['ConversationDelta'];
            this.conversation.update((c) =>
              c
                ? {
                    ...c,
                    messages: c.messages.map((m) =>
                      m.id === delta.messageId &&
                      m.status === 'PROCESSING' &&
                      m.text.length === delta.offset
                        ? { ...m, text: m.text + delta.text }
                        : m,
                    ),
                  }
                : c,
            );
          }
        },
        () => this.disconnected.set(true),
      );
    } catch (e) {
      if (!this.stream.signal.aborted) this.error.set(errorCode(e));
    }
  }
  async send(retry?: Schema['Message']) {
    const chat = this.conversation();
    if (!chat || this.busy() || this.inFlight()) return;
    const user = retry
      ? chat.messages.find((m) => m.requestId === retry.requestId && m.role === 'USER')
      : undefined;
    const input =
      retry && user
        ? {
            text: user.text,
            requestId: retry.requestId,
          }
        : (this.pending ?? {
            text: this.text.trim(),
            requestId: crypto.randomUUID(),
          });
    if (!input.text) return;
    this.pending = input;
    this.busy.set(true);
    this.error.set(null);
    try {
      const accepted = await this.api.client
        .POST('/api/conversations/{id}/messages', {
          params: { path: { id: chat.id } },
          body: input,
        })
        .then(apiData);
      if (this.stream.signal.aborted) return;
      // A subsequent stream snapshot may already be newer than this acceptance response.
      this.conversation.update((current) =>
        current?.messages.some(
          (m) => m.requestId === input.requestId && m.role === 'ASSISTANT' && m.status !== 'FAILED',
        )
          ? current
          : accepted,
      );
      this.pending = null;
      this.text = '';
    } catch (e) {
      if (!this.stream.signal.aborted) this.error.set(errorCode(e));
    } finally {
      this.busy.set(false);
    }
  }
  async attachment(id: string) {
    try {
      await this.api.download(
        await this.api.client
          .GET('/api/attachments/{id}', { params: { path: { id } } })
          .then(apiData),
      );
    } catch (e) {
      this.error.set(errorCode(e));
    }
  }
}
