/** One shared stream per ID, stopped when its last watcher stops or on `stopAll()`. */
export class Streams {
  private active = new Map<string, { controller: AbortController; watchers: number }>();
  watch(id: string, start: (signal: AbortSignal) => void): () => void {
    let stream = this.active.get(id);

    if (!stream) {
      stream = { controller: new AbortController(), watchers: 0 };
      this.active.set(id, stream);
      start(stream.controller.signal);
    }

    stream.watchers++;

    const current = stream;
    let stopped = false;

    return () => {
      if (stopped) return;
      stopped = true;
      if (--current.watchers > 0 || this.active.get(id) !== current) return;
      current.controller.abort();
      this.active.delete(id);
    };
  }

  stopAll() {
    for (const stream of this.active.values()) stream.controller.abort();
    this.active.clear();
  }
}
