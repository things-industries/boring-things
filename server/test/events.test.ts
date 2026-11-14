import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApplicationEvents, type ApplicationEvent } from '../src/application/events.js';

test('event subscriptions isolate owners and conversations and release listeners', () => {
  const events = new ApplicationEvents();
  const first: ApplicationEvent[] = [],
    second: ApplicationEvent[] = [],
    things: ApplicationEvent[] = [];
  const stop = events.subscribe({ userId: 'alice', conversationId: 'one' })((event) =>
    first.push(event),
  );
  const stopSecond = events.subscribe({ userId: 'alice', conversationId: 'two' })((event) =>
    second.push(event),
  );
  const stopThings = events.subscribe({ userId: 'alice' })((event) => things.push(event));
  events.publish({ type: 'data.changed', userId: 'bob' });
  events.publish({
    type: 'conversation.delta',
    userId: 'bob',
    conversationId: 'one',
    delta: { messageId: 'message', offset: 0, text: 'private' },
  });
  const changed: ApplicationEvent = { type: 'data.changed', userId: 'alice' };
  const delta: ApplicationEvent = {
    type: 'conversation.delta',
    userId: 'alice',
    conversationId: 'one',
    delta: { messageId: 'message', offset: 0, text: 'hello' },
  };
  events.publish(changed);
  events.publish(delta);
  assert.deepEqual(first, [changed, delta]);
  assert.deepEqual(second, [changed]);
  assert.deepEqual(things, [changed]);
  stop();
  stop();
  stopSecond();
  stopThings();
  events.publish(changed);
  events.publish(delta);
  assert.deepEqual(first, [changed, delta]);
  assert.deepEqual(second, [changed]);
  assert.deepEqual(things, [changed]);
});
