/** Waits for controlled fixture work while allowing the application runner to stop it. */
export async function pauseUntil(pause: Promise<void> | undefined, signal: AbortSignal) {
  signal.throwIfAborted();
  if (!pause) return;
  await new Promise<void>((resolve, reject) => {
    const stopped = () => reject(signal.reason);
    signal.addEventListener('abort', stopped, { once: true });
    pause.then(resolve, reject).finally(() => signal.removeEventListener('abort', stopped));
  });
}
