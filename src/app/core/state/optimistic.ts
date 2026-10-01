/**
 * Optimistic entity bookkeeping. Each entity keeps its last server-confirmed value and an ordered
 * list of pending changes; the visible value is the confirmed value with the changes applied.
 * `null` means absent: not yet created, deleted or hidden.
 */
import type {
  Change,
  Confirmation,
  Entry,
  Ledger,
  Staged,
} from '../../interfaces/optimistic.interface';
import type { UiErrorCode } from '../../interfaces/error.interface';

let lastChangeId = 0;

export const emptyLedger = <T>(): Ledger<T> => ({ ids: [], entries: {} });

export const updating =
  <T>(update: (value: T) => T) =>
  (value: T | null): T | null =>
    value === null ? null : update(value);

export const removing = (): null => null;

export const inserting =
  <T>(value: T) =>
  (): T =>
    value;

export function visibleValue<T>(entry: Entry<T> | undefined): T | null {
  if (!entry) return null;
  return entry.changes.reduce<T | null>((value, change) => change.apply(value), entry.confirmed);
}

export function visibleList<T>(ledger: Ledger<T>): T[] {
  return ledger.ids
    .map((id) => visibleValue(ledger.entries[id]))
    .filter((value): value is T => value !== null);
}

export function visibleMap<T>(ledger: Ledger<T>): Record<string, T> {
  const map: Record<string, T> = {};

  for (const id of ledger.ids) {
    const value = visibleValue(ledger.entries[id]);

    if (value !== null) map[id] = value;
  }

  return map;
}

export function confirmedValue<T>(ledger: Ledger<T>, id: string): T | null {
  return ledger.entries[id]?.confirmed ?? null;
}

export function addChange<T>(ledger: Ledger<T>, id: string, change: Change<T>): Ledger<T> {
  const entry = ledger.entries[id] ?? { confirmed: null, changes: [] };

  return withEntry(ledger, id, { ...entry, changes: [...entry.changes, change] });
}

export function confirmChange<T>(
  ledger: Ledger<T>,
  id: string,
  changeId: string,
  value?: Confirmation<T>,
): Ledger<T> {
  const entry = ledger.entries[id];
  const change = entry?.changes.find((c) => c.id === changeId);

  if (!entry || !change) return ledger;
  return withEntry(ledger, id, {
    confirmed: resolve(entry.confirmed, value === undefined ? change.apply : value),
    changes: entry.changes.filter((c) => c !== change),
  });
}

/** Drops one change; later pending changes on the same entity stay applied. */
export function revertChange<T>(ledger: Ledger<T>, id: string, changeId: string): Ledger<T> {
  const entry = ledger.entries[id];

  if (!entry?.changes.some((c) => c.id === changeId)) return ledger;
  return withEntry(ledger, id, {
    ...entry,
    changes: entry.changes.filter((c) => c.id !== changeId),
  });
}

/** Replaces one confirmed value; pending changes reapply on top. */
export function setConfirmed<T>(ledger: Ledger<T>, id: string, value: Confirmation<T>): Ledger<T> {
  const entry = ledger.entries[id] ?? { confirmed: null, changes: [] };

  return withEntry(ledger, id, { ...entry, confirmed: resolve(entry.confirmed, value) });
}

/**
 * Replaces confirmed values from a server response. With `replace`, the response is the whole
 * collection: other confirmed values are cleared and the response order is kept.
 */
export function receive<T>(
  ledger: Ledger<T>,
  values: T[],
  key: (value: T) => string,
  {
    replace = false,
    merge,
  }: { replace?: boolean; merge?: (previous: T | null, next: T) => T } = {},
): Ledger<T> {
  let next: Ledger<T> = replace
    ? {
        ids: [],
        entries: Object.fromEntries(
          Object.entries(ledger.entries).map(([id, entry]) => [id, { ...entry, confirmed: null }]),
        ),
      }
    : ledger;

  for (const value of values) {
    const id = key(value);

    next = setConfirmed(next, id, merge ? merge(confirmedValue(ledger, id), value) : value);
  }

  if (replace)
    for (const id of ledger.ids)
      if (next.entries[id] && !next.ids.includes(id)) next = withEntry(next, id, next.entries[id]);
  return next;
}

/** Adds a change and returns the handle that confirms or reverts it. */
export function stageChange<T>(
  read: () => Ledger<T>,
  write: (ledger: Ledger<T>) => void,
  id: string,
  apply: Change<T>['apply'],
): Staged<T> {
  const change: Change<T> = { id: String(++lastChangeId), apply };

  write(addChange(read(), id, change));
  return {
    confirm: (value) => write(confirmChange(read(), id, change.id, value)),
    revert: () => write(revertChange(read(), id, change.id)),
  };
}

/**
 * What a failed mutation does after reverting: a `401` stays quiet because `Auth` redirects, a
 * `409` fetches the entity again, and anything else shows a toast unless the mutation is silent.
 */
export function failureOutcome(
  code: UiErrorCode,
  { silent = false }: { silent?: boolean } = {},
): { toast: boolean; refetch: boolean } {
  if (code === 'unauthorized') return { toast: false, refetch: false };
  return { toast: !silent, refetch: code === 'conflict' };
}

function resolve<T>(confirmed: T | null, value: Confirmation<T>): T | null {
  return typeof value === 'function' ? (value as (c: T | null) => T | null)(confirmed) : value;
}

function withEntry<T>(ledger: Ledger<T>, id: string, entry: Entry<T>): Ledger<T> {
  const entries = { ...ledger.entries };

  if (entry.confirmed === null && !entry.changes.length) {
    delete entries[id];
    return { ids: ledger.ids.filter((i) => i !== id), entries };
  }

  entries[id] = entry;
  return { ids: ledger.ids.includes(id) ? ledger.ids : [...ledger.ids, id], entries };
}
