import { EventEmitter } from 'node:events';
import type { Schema } from '../../../shared/model.js';

export type ApplicationEvent =
  | { type: 'data.changed'; ownerId: string }
  | {
      type: 'conversation.delta';
      ownerId: string;
      conversationId: string;
      delta: Schema['ConversationDelta'];
    };

interface EventFilters {
  ownerId: string;
  conversationId?: string;
}

export class ApplicationEvents {
  private events = new EventEmitter();

  constructor() {
    this.events.setMaxListeners(0);
  }

  publish(event: ApplicationEvent): void {
    this.events.emit(event.ownerId, event);
  }

  subscribe({ ownerId, conversationId }: EventFilters) {
    return (receive: (event: ApplicationEvent) => void): (() => void) => {
      const listener = (event: ApplicationEvent) => {
        if (event.type === 'data.changed' || event.conversationId === conversationId)
          receive(event);
      };
      this.events.on(ownerId, listener);
      return () => {
        this.events.off(ownerId, listener);
      };
    };
  }
}
