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
import type { UiErrorCode } from '../../interfaces/error.interface';
import type { MutationResult } from '../../interfaces/state.interface';
import { errorCode } from '../../utils/error.util';
import { updating } from './optimistic';
import { Streams } from './streams';
import { withSession } from './with-load';
import { withOptimisticEntities } from './with-optimistic-entities';

/**
 * Conversations with their messages, loaded per ID and kept current by their stream. `byThing` holds
 * each Thing's current conversation: its latest one with messages, or the one this session started.
 */
export const ConversationsStore = signalStore(
  { providedIn: 'root' },

  withOptimisticEntities<Schema['Conversation']>(),

  withState<{ disconnected: Record<string, boolean>; byThing: Record<string, string | null> }>({
    disconnected: {},
    byThing: {},
  }),

  withProps(() => ({
    _service: inject(ConversationsService),
    _streams: new Streams(),
    _latestInFlight: new Map<string, Promise<UiErrorCode | null>>(),
  })),

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

    const setCurrent = (thingId: string, id: string | null) =>
      patchState(store, { byThing: { ...store.byThing(), [thingId]: id } });

    const loadOne = (id: string) => store.refresh(id, () => store._service.get(id));

    /** The Thing's current conversation when it is already loaded. */
    function current(thingId: string) {
      const id = store.byThing()[thingId];

      return id && store.entityMap()[id] ? id : null;
    }

    /** Loads the Thing's latest conversation with messages, recording null when it has none. */
    function fetchLatest(thingId: string) {
      const request = store._service
        .latest(thingId)
        .then(
          async (latest) => {
            if (!latest) {
              setCurrent(thingId, null);
              return null;
            }

            const code = await loadOne(latest.id);

            if (!code) setCurrent(thingId, latest.id);
            return code;
          },
          (e: unknown) => errorCode(e),
        )
        .finally(() => store._latestInFlight.delete(thingId));

      store._latestInFlight.set(thingId, request);
      return request;
    }

    async function create(thingId: string | null) {
      const result = await store.create(
        'startChat',
        { id: crypto.randomUUID(), thingId, messages: [] },
        () => store._service.create(thingId ? { thingId } : {}),
      );

      if (result.ok && thingId) setCurrent(thingId, result.value.id);
      return result;
    }

    return {
      loadOne,

      create,

      current,

      /**
       * Loads the Thing's latest conversation once per session so its chat opens without waiting.
       * A Thing without messages starts no conversation.
       */
      preload(thingId: string) {
        if (thingId in store.byThing()) return;
        void (store._latestInFlight.get(thingId) ?? fetchLatest(thingId));
      },

      /**
       * Opens the Thing's current conversation, loading its latest one when needed, or starts one
       * when the Thing has none.
       */
      async resume(thingId: string): Promise<MutationResult<{ id: string }>> {
        const loaded = current(thingId);

        if (loaded) return { ok: true, value: { id: loaded } };

        const code = await (store._latestInFlight.get(thingId) ?? fetchLatest(thingId));

        if (code) return { ok: false, code };

        const id = current(thingId);

        return id ? { ok: true, value: { id } } : create(thingId);
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
        store._latestInFlight.clear();
        store._clearEntities();
        patchState(store, { disconnected: {}, byThing: {} });
      },
    };
  }),

  withFeature((store) => withSession(store.reset)),
);
