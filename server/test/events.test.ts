import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApplicationEvents, type ApplicationEvent } from '../src/application/events.js';

test('event subscriptions isolate owners and conversations and release listeners', () => {
  const events = new ApplicationEvents();
  const first: ApplicationEvent[] = [],
    second: ApplicationEvent[] = [],
    things: ApplicationEvent[] = [];
  const stop = events.subscribe({ ownerId: 'alice', conversationId: 'one' })((event) =>
    first.push(event),
  );
  const stopSecond = events.subscribe({ ownerId: 'alice', conversationId: 'two' })((event) =>
    second.push(event),
  );
  const stopThings = events.subscribe({ ownerId: 'alice' })((event) => things.push(event));
  events.publish({ type: 'data.changed', ownerId: 'bob' });
  events.publish({
    type: 'conversation.delta',
    ownerId: 'bob',
    conversationId: 'one',
    delta: { messageId: 'message', offset: 0, text: 'private' },
  });
  const changed: ApplicationEvent = { type: 'data.changed', ownerId: 'alice' };
  const delta: ApplicationEvent = {
    type: 'conversation.delta',
    ownerId: 'alice',
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
