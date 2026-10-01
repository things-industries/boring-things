import { computed, inject } from '@angular/core';
import {
  patchState,
  signalStoreFeature,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import { clientIdsAccepted } from '../mocks/client-ids.mock';
import { Toasts } from '../services/toasts.service';
import type {
  Change,
  Confirmation,
  Ledger,
  MutationOptions,
  PendingChange,
  Staged,
} from '../../interfaces/optimistic.interface';
import type { MutationResult } from '../../interfaces/state.interface';
import type { ActionTerm } from '../../interfaces/terms.interface';
import { errorCode } from '../../utils/error.util';
import {
  confirmedValue,
  emptyLedger,
  failureOutcome,
  inserting,
  receive,
  setConfirmed,
  stageChange,
  visibleList,
  visibleMap,
} from './optimistic';

/**
 * Entity collection whose changes apply optimistically. `entities` and `entityMap` expose visible
 * values; `mutate` runs a request and confirms or reverts its staged changes, which may come from
 * other stores.
 */
export function withOptimisticEntities<T extends { id: string }>() {
  return signalStoreFeature(
    withState<{ _ledger: Ledger<T> }>({ _ledger: emptyLedger<T>() }),
    withComputed(({ _ledger }) => ({
      entities: computed(() => visibleList(_ledger())),
      entityMap: computed(() => visibleMap(_ledger())),
    })),

    withMethods((store) => {
      const toasts = inject(Toasts);
      const read = () => store._ledger();
      const write = (ledger: Ledger<T>) => patchState(store, { _ledger: ledger });

      async function mutate<R>(
        action: ActionTerm,
        steps: [Staged<T>, ...PendingChange[]] | [],
        request: () => Promise<R>,
        options: MutationOptions<T, R> = {},
      ): Promise<MutationResult<R>> {
        let value: R;

        try {
          value = await request();
        } catch (e) {
          for (const step of steps) step.revert();

          const code = errorCode(e);
          const outcome = failureOutcome(code, options);

          if (outcome.toast) toasts.error(action, code);
          if (outcome.refetch) void options.refetch?.().catch(() => undefined);

          return { ok: false, code };
        }

        const [first, ...others] = steps;

        first?.confirm(options.confirm ? options.confirm(value) : undefined);
        for (const step of others) step.confirm();
        return { ok: true, value };
      }

      return {
        stage: (id: string, apply: Change<T>['apply']): Staged<T> =>
          stageChange(read, write, id, apply),

        receive(values: T[], options?: Parameters<typeof receive<T>>[3]) {
          write(receive(read(), values, (value) => value.id, options));
        },

        setConfirmed(id: string, value: Confirmation<T>) {
          write(setConfirmed(read(), id, value));
        },
        mutate,

        /**
         * Fetches one entity again, combined with its confirmed value by `merge` when given; a `404`
         * removes it. Resolves to the error code on failure.
         */
        async refresh(
          id: string,
          request: () => Promise<T>,
          merge?: (previous: T | null, next: T) => T,
        ) {
          try {
            const value = await request();

            write(
              setConfirmed(read(), id, merge ? merge(confirmedValue(read(), id), value) : value),
            );
            return null;
          } catch (e) {
            const code = errorCode(e);

            if (code === 'not-found') write(setConfirmed(read(), id, null));
            return code;
          }
        },

        /** Inserts optimistically when the API accepts client IDs; otherwise after the response. */
        async create(action: ActionTerm, value: T, request: () => Promise<T>) {
          if (clientIdsAccepted)
            return mutate(action, [stageChange(read, write, value.id, inserting(value))], request, {
              confirm: (created) => created,
            });

          const result = await mutate(action, [], request);

          if (result.ok) write(setConfirmed(read(), result.value.id, result.value));
          return result;
        },

        _clearEntities: () => write(emptyLedger<T>()),
      };
    }),
  );
}
