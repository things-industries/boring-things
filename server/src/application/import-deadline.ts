/**
 * Bounds asynchronous workflow waits with an abort signal, even when a provider does not honour
 * cancellation.
 */

// Providers must accept AbortSignal; the workflow also stops waiting if an adapter ignores it.
export function withDeadline<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    // Rejecting this wait does not cancel the underlying work; providers must use the signal to stop external requests.
    const abort = () => reject(signal.reason);

    signal.addEventListener('abort', abort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        if (signal.aborted) reject(signal.reason);
        else resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}
