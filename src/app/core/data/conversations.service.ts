import { Injectable, inject } from '@angular/core';
import type { Schema } from '../../../../shared/model';
import { apiData } from '../api/api-client';
import { watchSse } from '../api/thing-stream';
import { Api } from '../services/api.service';
import type { ConversationStreamEvent } from '../../interfaces/conversation.interface';

@Injectable({ providedIn: 'root' })
export class ConversationsService {
  private client = inject(Api).client;
  get(id: string) {
    return this.client.GET('/api/conversations/{id}', { params: { path: { id } } }).then(apiData);
  }

  create(body: Schema['ConversationInput']) {
    return this.client.POST('/api/conversations', { body }).then(apiData);
  }

  send(id: string, body: Schema['MessageInput']) {
    return this.client
      .POST('/api/conversations/{id}/messages', { params: { path: { id } }, body })
      .then(apiData);
  }

  watch(
    id: string,
    signal: AbortSignal,
    receive: (event: ConversationStreamEvent) => void,
    failed: () => void,
  ) {
    return watchSse(
      () =>
        this.client.GET('/api/conversations/{id}/stream', {
          params: { path: { id } },
          parseAs: 'stream',
          signal,
        }),
      signal,
      (event, data) => {
        if (event === 'conversation.snapshot')
          receive({ type: 'snapshot', conversation: data as Schema['Conversation'] });
        else if (event === 'conversation.delta')
          receive({ type: 'delta', delta: data as Schema['ConversationDelta'] });
      },
      failed,
    );
  }
}
