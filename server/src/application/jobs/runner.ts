/** Runs persisted job processors independently while retaining one database leader and orderly shutdown. */
export interface JobProcessor {
  recover(): Promise<void>;
  next(signal: AbortSignal): Promise<boolean>;
}
export type ReportJobFailure = (
  error: unknown,
  operation: 'process' | 'recover' | 'acquire_lease' | 'release_lease',
  processor?: string,
) => void;
export interface JobLease {
  acquire(): Promise<(() => Promise<void>) | undefined>;
}

/** Signals that a claimed job already reported its exception. */
export class ReportedJobError extends Error {
  constructor(cause: unknown) {
    super('Claimed job failed', { cause });
  }
}

export class JobRunner {
  private stopped = false;
  private pending = new Map<JobProcessor, Promise<void>>();
  private activation?: Promise<boolean>;
  private abort = new AbortController();
  private timer?: ReturnType<typeof setInterval>;
  private release?: () => Promise<void>;
  private recovered = false;
  constructor(
    private processors: JobProcessor[],
    private reportFailure: ReportJobFailure,
    private lease?: JobLease,
  ) {}

  // Acquires leadership before scheduling processor work.
  async start() {
    await this.ensureActive();
    if (this.stopped) return;
    this.timer = setInterval(() => this.wake(), 1000);
    this.timer.unref();
    this.wake();
  }

  // Starts idle processors without interrupting work already running.
  wake() {
    if (this.stopped) return;
    void this.ensureActive()
      .then((active) => {
        if (!active || this.stopped) return;
        for (const processor of this.processors) {
          if (this.pending.has(processor)) continue;
          const work = this.drain(processor)
            .catch((error: unknown) => {
              if (!(error instanceof ReportedJobError))
                this.reportFailure(error, 'process', processor.constructor.name);
            })
            .finally(() => this.pending.delete(processor));
          this.pending.set(processor, work);
        }
      })
      .catch(() => {}); // Activation reports failures before rejecting.
  }

  // Stops every job before allowing another process to acquire leadership.
  async stop() {
    this.stopped = true;
    clearInterval(this.timer);
    this.abort.abort();
    await this.activation;
    await Promise.all(this.pending.values());
    await this.releaseLease();
  }

  // Shares leadership acquisition and recovery across concurrent wake requests.
  private ensureActive() {
    this.activation ??= this.activate().finally(() => {
      this.activation = undefined;
    });
    return this.activation;
  }

  // Recovers interrupted jobs once after acquiring the database lease.
  private async activate() {
    if (this.recovered) return true;
    let processor: JobProcessor | undefined;
    try {
      if (this.lease) {
        this.release = await this.lease.acquire();
        if (!this.release) return false;
      }
      if (this.stopped) return false;
      for (const current of this.processors) {
        processor = current;
        await current.recover();
      }
      this.recovered = true;
      return true;
    } catch (error) {
      this.reportFailure(
        error,
        processor ? 'recover' : 'acquire_lease',
        processor?.constructor.name,
      );
      await this.releaseLease();
      throw error;
    }
  }

  // Releases leadership and reports failures outside an individual job.
  private async releaseLease() {
    try {
      await this.release?.();
    } catch (error) {
      this.reportFailure(error, 'release_lease');
      throw error;
    } finally {
      this.release = undefined;
    }
  }

  // Processes one capability serially while other capabilities continue independently.
  private async drain(processor: JobProcessor) {
    while (!this.stopped) {
      if (!(await processor.next(this.abort.signal))) return;
    }
  }
}
