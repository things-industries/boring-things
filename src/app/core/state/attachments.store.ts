import { computed, inject } from '@angular/core';
import { signalStore, withComputed, withFeature, withMethods, withProps } from '@ngrx/signals';
import type { Schema } from '../../../../shared/model';
import { AttachmentsService } from '../data/attachments.service';
import { CONFIG } from '../runtime-config';
import { Toasts } from '../services/toasts.service';
import { removing, updating } from './optimistic';
import { withEntityCollection } from './with-entity-collection';

export const AttachmentsStore = signalStore(
  { providedIn: 'root' },

  withProps(() => ({
    _service: inject(AttachmentsService),
    _config: inject(CONFIG),
    _toasts: inject(Toasts),
  })),

  withFeature((store) =>
    withEntityCollection<Schema['Attachment']>({
      list: () => store._service.list(),
      get: (id) => store._service.get(id),
    }),
  ),

  withComputed(({ entities }) => ({
    attachmentsByThing: computed(() => {
      const groups: Record<string, Schema['Attachment'][]> = {};

      for (const attachment of entities())
        for (const thingId of attachment.thingIds) (groups[thingId] ??= []).push(attachment);
      return groups;
    }),
  })),

  withMethods((store) => ({
    /** Uploads a file and starts its independent transcription. */
    async upload(file: File, thingId?: string) {
      if (file.size > store._config.maxUploadBytes) {
        store._toasts.error('uploadFile', 'too-large');
        return { ok: false, code: 'too-large' } as const;
      }

      const result = await store.mutate('uploadFile', [], async () => {
        return store._service.upload(file, thingId);
      });

      if (result.ok) {
        store.setConfirmed(result.value.id, result.value);
      }
      return result;
    },

    update(id: string, patch: Schema['AttachmentPatch']) {
      const step = store.stage(
        id,
        updating((attachment) => ({ ...attachment, ...patch })),
      );

      return store.mutate('saveChanges', [step], () => store._service.update(id, patch), {
        confirm: (attachment) => attachment,
        refetch: () => store.loadOne(id),
      });
    },

    remove(id: string) {
      return store.mutate(
        'deleteFile',
        [store.stage(id, removing)],
        () => store._service.remove(id),
        {
          refetch: () => store.loadOne(id),
        },
      );
    },

    /** Unlinks a file from its only Thing and deletes it. */
    discard(id: string, thingId: string) {
      return store.mutate(
        'deleteFile',
        [store.stage(id, removing)],
        async () => {
          await store._service.unlink(id, thingId);
          await store._service.remove(id);
        },
        { refetch: () => store.loadOne(id) },
      );
    },

    link(id: string, thingId: string) {
      const step = store.stage(
        id,
        updating((attachment) =>
          attachment.thingIds.includes(thingId)
            ? attachment
            : { ...attachment, thingIds: [...attachment.thingIds, thingId] },
        ),
      );

      return store.mutate('linkFile', [step], () => store._service.link(id, thingId), {
        refetch: () => store.loadOne(id),
      });
    },

    unlink(id: string, thingId: string) {
      return store.mutate(
        'unlinkFile',
        [store.stage(id, unlinking(thingId))],
        () => store._service.unlink(id, thingId),
        { refetch: () => store.loadOne(id) },
      );
    },
  })),
);

export const unlinking = (thingId: string) =>
  updating<Schema['Attachment']>((attachment) => ({
    ...attachment,
    thingIds: attachment.thingIds.filter((id) => id !== thingId),
  }));
