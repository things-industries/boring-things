import { computed, inject } from '@angular/core';
import { signalStore, withComputed, withFeature, withMethods, withProps } from '@ngrx/signals';
import type { Schema } from '../../../../shared/model';
import type { ActionTerm } from '../../interfaces/terms.interface';
import { IssuesService } from '../data/issues.service';
import { groupBy } from '../../utils/collection.util';
import { updating } from './optimistic';
import { withEntityCollection } from './with-entity-collection';

export const IssuesStore = signalStore(
  { providedIn: 'root' },

  withProps(() => ({ _service: inject(IssuesService) })),

  withFeature((store) =>
    withEntityCollection<Schema['Issue']>({
      list: () => store._service.list(),
      get: (id) => store._service.get(id),
    }),
  ),

  withComputed(({ entities }) => ({
    issuesByThing: computed(() => groupBy(entities(), (issue) => issue.thingId)),
    openIssues: computed(() => entities().filter((issue) => issue.status === 'OPEN')),
  })),

  withMethods((store) => ({
    create(input: Schema['IssueInput']) {
      const issue: Schema['Issue'] = {
        id: crypto.randomUUID(),
        thingId: input.thingId,
        title: input.title,
        description: input.description ?? '',
        status: input.status ?? 'OPEN',
        resolvedAt: input.status === 'RESOLVED' ? new Date().toISOString() : null,
        statusText: input.statusText ?? null,
        dueDate: input.dueDate ?? null,
        isSample: false,
      };

      return store.create('addIssue', issue, () => store._service.create(input));
    },

    update(id: string, patch: Schema['IssuePatch'], action: ActionTerm = 'saveChanges') {
      const step = store.stage(
        id,
        updating((issue) => patchIssue(issue, patch)),
      );

      return store.mutate(action, [step], () => store._service.update(id, patch), {
        confirm: (issue) => issue,
        refetch: () => store.loadOne(id),
      });
    },
  })),

  withMethods((store) => ({
    resolve: (id: string) => store.update(id, { status: 'RESOLVED' }, 'resolveIssue'),
  })),
);

function patchIssue(issue: Schema['Issue'], patch: Schema['IssuePatch']): Schema['Issue'] {
  const next = { ...issue, ...patch };

  if (patch.status && patch.status !== issue.status)
    next.resolvedAt = patch.status === 'RESOLVED' ? new Date().toISOString() : null;
  return next;
}
