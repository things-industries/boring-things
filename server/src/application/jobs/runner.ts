export interface JobProcessor {
  recover(): Promise<void>;
  next(signal: AbortSignal): Promise<boolean>;
}
export type ReportJobFailure = (error: unknown) => void;
export interface JobLease {
  acquire(): Promise<(() => Promise<void>) | undefined>;
}

export class JobRunner {
  private stopped = false;
  private pending?: Promise<void>;
  private abort = new AbortController();
  private timer?: ReturnType<typeof setInterval>;
  private release?: () => Promise<void>;
  private recovered = false;
  constructor(
    private processors: JobProcessor[],
    private reportFailure: ReportJobFailure,
    private lease?: JobLease,
  ) {}
  async start() {
    await this.activate();
    this.timer = setInterval(() => this.wake(), 1000);
    this.timer.unref();
    this.wake();
  }
  wake() {
    if (this.stopped || this.pending) return;
    this.pending = this.drain()
      .catch(this.reportFailure)
      .finally(() => {
        this.pending = undefined;
      });
  }
  async stop() {
    this.stopped = true;
    clearInterval(this.timer);
    this.abort.abort();
    await this.pending;
    await this.release?.();
    this.release = undefined;
  }

  private async activate() {
    if (this.recovered) return true;
    if (this.lease) {
      this.release = await this.lease.acquire();
      if (!this.release) return false;
    }
    try {
      if (this.stopped) return false;
      for (const processor of this.processors) await processor.recover();
      this.recovered = true;
      return true;
    } catch (error) {
      await this.release?.();
      this.release = undefined;
      throw error;
    }
  }

  private async drain() {
    if (!(await this.activate())) return;
    while (!this.stopped) {
      let worked = false;
      for (const processor of this.processors) {
        if (this.stopped) return;
        worked = (await processor.next(this.abort.signal)) || worked;
      }
      if (!worked) return;
    }
  }
}
