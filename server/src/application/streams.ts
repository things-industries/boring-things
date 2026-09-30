/**
 * Publishes process-local, owner-scoped change notifications so stream handlers can reread
 * persisted snapshots.
 */

import { EventEmitter } from 'node:events';

export class ThingChanges {
  private events = new EventEmitter();

  constructor() {
    this.events.setMaxListeners(0);
  }

  publish(owner: string) {
    this.events.emit(owner);
  }

  subscribe(owner: string, fn: () => void) {
    this.events.on(owner, fn);
    return () => this.events.off(owner, fn);
  }
}
