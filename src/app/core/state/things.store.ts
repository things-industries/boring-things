import { computed, inject } from '@angular/core';
import {
  patchState,
  signalStore,
  withComputed,
  withFeature,
  withMethods,
  withProps,
  withState,
} from '@ngrx/signals';
import type { Schema } from '../../../../shared/model';
import { ImportsService } from '../data/imports.service';
import { ThingsService } from '../data/things.service';
import { CONFIG } from '../runtime-config';
import { Toasts } from '../services/toasts.service';
import type { PendingChange } from '../../interfaces/optimistic.interface';
import type { MutationResult } from '../../interfaces/state.interface';
import type { ThingRecord } from '../../interfaces/thing.interface';
import { groupBy } from '../../utils/collection.util';
import { errorCode } from '../../utils/error.util';
import { AttachmentsStore, unlinking } from './attachments.store';
import { ConversationsStore } from './conversations.store';
import { EventsStore } from './events.store';
import { IssuesStore } from './issues.store';
import { removing, updating } from './optimistic';
import { PurchasablesStore } from './purchasables.store';
import { RegistryStore } from './registry.store';
import { Streams } from './streams';
import { applyThingPatch, thingRecord } from './thing-patch';
import { withEntityCollection } from './with-entity-collection';

/** Keeps a newer revision over an older response, and details loaded earlier over a list item. */
const keepNewer = (previous: ThingRecord | null, next: ThingRecord): ThingRecord => {
  if (previous && previous.revision > next.revision) return previous;
  return next.detail || !previous?.detail ? next : { ...next, detail: previous.detail };
};

/**
 * Things and their details. Deleting a Thing cascades to the child stores; child stores never
 * inject this store.
 */
export const ThingsStore = signalStore(
  { providedIn: 'root' },

  withState<{ disconnected: Record<string, boolean> }>({ disconnected: {} }),

  withProps(() => ({
    _service: inject(ThingsService),
    _imports: inject(ImportsService),
    _config: inject(CONFIG),
    _toasts: inject(Toasts),
    _registry: inject(RegistryStore),
    _issues: inject(IssuesStore),
    _events: inject(EventsStore),
    _attachments: inject(AttachmentsStore),
    _purchasables: inject(PurchasablesStore),
    _conversations: inject(ConversationsStore),
    _streams: new Streams(),
  })),

  withFeature((store) =>
    withEntityCollection<ThingRecord>({
      list: () => store._service.list(),
      get: (id) => store._service.get(id).then(thingRecord),
      merge: keepNewer,

      onReset() {
        store._streams.stopAll();
        patchState(store, { disconnected: {} });
      },
    }),
  ),

  withComputed(({ entities }) => ({
    thingsByCategory: computed(() => groupBy(entities(), (thing) => thing.categoryId)),
  })),

  withMethods((store) => {
    const setDisconnected = (id: string, value: boolean) =>
      store.disconnected()[id] !== value &&
      patchState(store, { disconnected: { ...store.disconnected(), [id]: value } });

    /**
     * Starts an import from an uploaded attachment, enriching `thingId` when given. Resolves once
     * the Thing the import fills has loaded.
     */
    async function extract(attachmentId: string, thingId?: string) {
      const result = await store.mutate('importThing', [], () =>
        store._imports.start({ attachmentId, ...(thingId && { thingId }) }),
      );

      if (result.ok)
        await Promise.all([
          store.loadOne(result.value.thingId),
          store._attachments.loadOne(attachmentId),
        ]);
      return result;
    }

    return {
      create(input: Schema['ThingCreate']) {
        const now = new Date().toISOString();

        const thing: ThingRecord = {
          id: crypto.randomUUID(),
          name: input.name,
          description: input.description ?? '',
          categoryId: input.categoryId,
          revision: 0,
          imageAttachmentId: input.imageAttachmentId ?? null,
          tagIds: input.tagIds ?? [],
          createdAt: now,
          updatedAt: now,
          isSample: false,
          accessCount: 0,
          lastViewedAt: null,
        };

        return store.create('addThing', thing, () =>
          store._service.create(input).then(thingRecord),
        );
      },

      update(id: string, patch: Schema['ThingPatch']) {
        const step = store.stage(
          id,
          updating((thing) => applyThingPatch(thing, patch, store._registry.index())),
        );

        return store.mutate(
          'saveChanges',
          [step],
          () => store._service.update(id, patch).then(thingRecord),
          {
            confirm: (thing) => (previous) => keepNewer(previous, thing),
            refetch: () => store.loadOne(id),
          },
        );
      },

      /** Hides the Thing and its children and unlinks its attachments until the server confirms. */
      remove(id: string) {
        const children: PendingChange[] = [
          ...(store._issues.issuesByThing()[id] ?? []).map((c) =>
            store._issues.stage(c.id, removing),
          ),
          ...(store._events.eventsByThing()[id] ?? []).map((c) =>
            store._events.stage(c.id, removing),
          ),
          ...(store._purchasables.purchasablesByThing()[id] ?? []).map((c) =>
            store._purchasables.stage(c.id, removing),
          ),
          ...store._conversations
            .entities()
            .filter((c) => c.thingId === id)
            .map((c) => store._conversations.stage(c.id, removing)),
          ...(store._attachments.attachmentsByThing()[id] ?? []).map((a) =>
            store._attachments.stage(a.id, unlinking(id)),
          ),
        ];

        return store.mutate(
          'deleteThing',
          [store.stage(id, removing), ...children],
          () => store._service.remove(id),
          { refetch: () => store.reload() },
        );
      },

      /** Records a view. A failure reverts without a toast. */
      view(id: string) {
        const step = store.stage(
          id,
          updating((thing) => ({
            ...thing,
            accessCount: thing.accessCount + 1,
            lastViewedAt: new Date().toISOString(),
          })),
        );

        return store.mutate('saveChanges', [step], () => store._service.view(id), {
          silent: true,
          confirm: (access) => (thing) => thing && { ...thing, ...access },
        });
      },

      /** Returns a masked value, or `undefined` after reporting the failure. */
      async reveal(id: string, field: Schema['RevealRequest']) {
        try {
          return (await store._service.reveal(id, field)).value;
        } catch (e) {
          const code = errorCode(e);

          if (code !== 'unauthorized') store._toasts.error('revealField', code);
          return undefined;
        }
      },

      /**
       * Shares one stream per Thing. A snapshot with a new revision also reloads the Thing's child
       * collections. Returns the function that stops watching.
       */
      watch(id: string) {
        return store._streams.watch(id, (signal) => {
          void store._service.watch(
            id,
            signal,
            (thing) => {
              const previous = store.entityMap()[id]?.revision;

              setDisconnected(id, false);
              if (previous !== undefined && thing.revision < previous) return;
              store.setConfirmed(id, thingRecord(thing));
              if (previous === undefined || thing.revision === previous) return;
              for (const child of [store._issues, store._events, store._attachments])
                if (child.status() !== 'idle') void child.reload();
              void store._purchasables.loadForThing(id);
            },
            () => setDisconnected(id, true),
          );
        });
      },

      /**
       * Uploads a source and starts an import, enriching `thingId` when given. Resolves once the
       * Thing the import fills has loaded.
       */
      async startImport(
        file: File,
        thingId?: string,
      ): Promise<MutationResult<Schema['ImportAccepted']>> {
        if (file.size > store._config.maxUploadBytes) {
          store._toasts.error('importThing', 'too-large');
          return { ok: false, code: 'too-large' };
        }

        const upload = await store._attachments.upload(file);

        if (!upload.ok) return upload;
        return extract(upload.value.id, thingId);
      },

      async retryImport(id: string) {
        const result = await store.mutate('retryImport', [], () => store._imports.retry(id));

        if (result.ok)
          await Promise.all(result.value.thingIds.map((thing) => store.loadOne(thing)));
        return result;
      },

      /** Reloads Things and every child collection already loaded. */
      reloadWithChildren() {
        const children = [store._issues, store._events, store._attachments].filter(
          (child) => child.status() !== 'idle',
        );

        return Promise.all([store.reload(), ...children.map((child) => child.reload())]);
      },
    };
  }),
);
