import { inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withFeature,
  withMethods,
  withProps,
  withState,
} from '@ngrx/signals';
import type { Schema } from '../../../../shared/model';
import { ConversationsService } from '../data/conversations.service';
import type { ConversationStreamEvent } from '../../interfaces/conversation.interface';
import { updating } from './optimistic';
import { Streams } from './streams';
import { withSession } from './with-load';
import { withOptimisticEntities } from './with-optimistic-entities';

/** Conversations with their messages, loaded per ID and kept current by their stream. */
export const ConversationsStore = signalStore(
  { providedIn: 'root' },

  withOptimisticEntities<Schema['Conversation']>(),

  withState<{ disconnected: Record<string, boolean> }>({ disconnected: {} }),

  withProps(() => ({ _service: inject(ConversationsService), _streams: new Streams() })),

  withMethods((store) => {
    const setDisconnected = (id: string, value: boolean) =>
      store.disconnected()[id] !== value &&
      patchState(store, { disconnected: { ...store.disconnected(), [id]: value } });

    function receive(id: string, event: ConversationStreamEvent) {
      setDisconnected(id, false);
      if (event.type === 'snapshot') store.setConfirmed(id, event.conversation);
      else {
        const { messageId, offset, text } = event.delta;

        store.setConfirmed(id, (conversation) =>
          conversation
            ? {
                ...conversation,
                messages: conversation.messages.map((m) =>
                  m.id === messageId && m.status === 'PROCESSING' && m.text.length === offset
                    ? { ...m, text: m.text + text }
                    : m,
                ),
              }
            : conversation,
        );
      }
    }

    const loadOne = (id: string) => store.refresh(id, () => store._service.get(id));

    return {
      loadOne,

      create(thingId: string | null) {
        return store.create('startChat', { id: crypto.randomUUID(), thingId, messages: [] }, () =>
          store._service.create(thingId ? { thingId } : {}),
        );
      },

      /** Appends the user message as pending; the assistant reply arrives on the stream. */
      send(id: string, input: Schema['MessageInput']) {
        const message: Schema['Message'] = {
          id: crypto.randomUUID(),
          conversationId: id,
          requestId: input.requestId,
          role: 'USER',
          text: input.text,
          cards: [],
          sourceRefs: [],
          status: 'QUEUED',
          createdAt: new Date().toISOString(),
        };

        const step = store.stage(
          id,
          updating((conversation) =>
            conversation.messages.some((m) => m.requestId === input.requestId && m.role === 'USER')
              ? conversation
              : { ...conversation, messages: [...conversation.messages, message] },
          ),
        );

        return store.mutate('sendMessage', [step], () => store._service.send(id, input), {
          // A stream snapshot may already be newer than the acceptance response.
          confirm: (accepted) => (current) =>
            current?.messages.some((m) => m.requestId === input.requestId && m.role === 'ASSISTANT')
              ? current
              : accepted,
          refetch: () => loadOne(id),
        });
      },

      /** Shares one stream per conversation. Returns the function that stops watching. */
      watch(id: string) {
        return store._streams.watch(id, (signal) => {
          void store._service.watch(
            id,
            signal,
            (event) => receive(id, event),
            () => setDisconnected(id, true),
          );
        });
      },

      reset() {
        store._streams.stopAll();
        store._clearEntities();
        patchState(store, { disconnected: {} });
      },
    };
  }),

  withFeature((store) => withSession(store.reset)),
);
