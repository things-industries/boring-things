export interface Change<T> {
  id: string;
  apply: (value: T | null) => T | null;
}

export interface Entry<T> {
  confirmed: T | null;
  changes: Change<T>[];
}

export interface Ledger<T> {
  ids: string[];
  entries: Record<string, Entry<T>>;
}

/** A confirmed value, or a function deriving it from the current confirmed value. */
export type Confirmation<T> = T | null | ((confirmed: T | null) => T | null);

/** A pending change in any store, confirmed or reverted once its request settles. */
export interface PendingChange {
  /** The change itself becomes confirmed, as for `204` responses. */
  confirm(): void;
  revert(): void;
}

/** A pending change that can also be confirmed with the server's value. */
export interface Staged<T> extends PendingChange {
  confirm(value?: Confirmation<T>): void;
}

export interface MutationOptions<T, R> {
  /** Confirmed value for the first step; other steps confirm their own change. */
  confirm?: (value: R) => Confirmation<T>;
  /** Fetches the entity again after a `409`. */
  refetch?: () => Promise<unknown>;
  /** Reverts without a toast. */
  silent?: boolean;
}
