export interface JobProcessor {
  recover(): Promise<void>;
  next(signal: AbortSignal): Promise<boolean>;
}
export type ReportJobFailure = (error: unknown) => void;

export class JobRunner {
  private stopped = false;
  private pending?: Promise<void>;
  private abort = new AbortController();
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    private processors: JobProcessor[],
    private reportFailure: ReportJobFailure,
  ) {}
  async start() {
    for (const processor of this.processors) await processor.recover();
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
  }
  private async drain() {
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
