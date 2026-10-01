import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyLedger,
  failureOutcome,
  inserting,
  receive,
  removing,
  stageChange,
  updating,
  visibleList,
  visibleMap,
} from '../../src/app/core/state/optimistic.js';
import type { Ledger } from '../../src/app/interfaces/optimistic.interface.js';

interface Item {
  id: string;
  name: string;
  links?: string[];
}

function store(items: Item[] = []) {
  let ledger: Ledger<Item> = receive(emptyLedger<Item>(), items, (i) => i.id, { replace: true });

  return {
    read: () => ledger,
    write: (next: Ledger<Item>) => (ledger = next),

    stage: (id: string, apply: (value: Item | null) => Item | null) =>
      stageChange(
        () => ledger,
        (next) => (ledger = next),
        id,
        apply,
      ),

    visible: () => visibleList(ledger),
    get: (id: string) => visibleMap(ledger)[id],
  };
}

const rename = (name: string) => updating<Item>((item) => ({ ...item, name }));

test('a change is visible immediately and the server value replaces it on confirm', () => {
  const items = store([{ id: 'a', name: 'Hob' }]);
  const change = items.stage('a', rename('Kitchen hob'));

  assert.equal(items.get('a')?.name, 'Kitchen hob');
  change.confirm({ id: 'a', name: 'Kitchen hob (server)' });
  assert.equal(items.get('a')?.name, 'Kitchen hob (server)');
  assert.deepEqual(items.read().entries['a']?.changes, []);
});

test('confirming without a value keeps the change, as for 204 responses', () => {
  const items = store([{ id: 'a', name: 'Hob' }]);

  items.stage('a', removing).confirm();
  assert.deepEqual(items.visible(), []);
  assert.deepEqual(items.read(), emptyLedger());
});

test('reverting restores the confirmed value', () => {
  const items = store([{ id: 'a', name: 'Hob' }]);
  const change = items.stage('a', rename('Oven'));

  change.revert();
  assert.equal(items.get('a')?.name, 'Hob');
});

test('a failed change keeps later pending changes on the same entity', () => {
  const items = store([{ id: 'a', name: 'Hob', links: [] }]);
  const first = items.stage('a', rename('Oven'));

  const second = items.stage(
    'a',
    updating((item) => ({ ...item, links: [...(item.links ?? []), 't1'] })),
  );

  first.revert();
  assert.deepEqual(items.get('a'), { id: 'a', name: 'Hob', links: ['t1'] });
  second.confirm();
  assert.deepEqual(items.get('a'), { id: 'a', name: 'Hob', links: ['t1'] });
});

test('changes confirm out of order', () => {
  const items = store([{ id: 'a', name: 'Hob' }]);
  const first = items.stage('a', rename('Oven'));
  const second = items.stage('a', rename('Range'));

  second.confirm({ id: 'a', name: 'Range' });
  assert.equal(
    items.get('a')?.name,
    'Oven',
    'the earlier pending change applies over the response',
  );

  first.confirm({ id: 'a', name: 'Oven' });
  assert.equal(items.get('a')?.name, 'Oven');
  assert.deepEqual(items.read().entries['a']?.changes, []);
});

test('a failed create removes the entity', () => {
  const items = store();
  const create = items.stage('new', inserting({ id: 'new', name: 'Van' }));

  assert.equal(items.visible().length, 1);
  create.revert();
  assert.deepEqual(items.read(), emptyLedger());
});

test('server snapshots replace confirmed values and pending changes reapply', () => {
  const items = store([
    { id: 'a', name: 'Hob' },
    { id: 'b', name: 'Van' },
  ]);

  items.stage('a', rename('Oven'));

  const create = items.stage('c', inserting({ id: 'c', name: 'Bike' }));

  items.write(
    receive(
      items.read(),
      [
        { id: 'b', name: 'Camper' },
        { id: 'a', name: 'Hob 2' },
      ],
      (i) => i.id,
      {
        replace: true,
      },
    ),
  );

  assert.deepEqual(
    items.visible().map((i) => i.name),
    ['Camper', 'Oven', 'Bike'],
  );

  create.revert();
  assert.deepEqual(
    items.visible().map((i) => i.name),
    ['Camper', 'Oven'],
  );
});

test('receive merges with the previous confirmed value', () => {
  const items = store([{ id: 'a', name: 'Hob', links: ['t1'] }]);

  items.write(
    receive(items.read(), [{ id: 'a', name: 'Oven' }], (i) => i.id, {
      merge: (previous, next) => ({ ...previous, ...next }),
    }),
  );

  assert.deepEqual(items.get('a'), { id: 'a', name: 'Oven', links: ['t1'] });
});

test('a transaction across stores reverts every change on failure', () => {
  const things = store([{ id: 't1', name: 'Hob' }]);
  const attachments = store([{ id: 'f1', name: 'Manual', links: ['t1', 't2'] }]);

  const steps = [
    things.stage('t1', removing),
    attachments.stage(
      'f1',
      updating((file) => ({ ...file, links: file.links?.filter((id) => id !== 't1') })),
    ),
  ];

  assert.deepEqual(things.visible(), []);
  assert.deepEqual(attachments.get('f1')?.links, ['t2']);
  for (const step of steps) step.revert();
  assert.equal(things.get('t1')?.name, 'Hob');
  assert.deepEqual(attachments.get('f1')?.links, ['t1', 't2']);
});

test('a confirmation can derive from the confirmed value', () => {
  const items = store([{ id: 'a', name: 'Hob', links: ['x'] }]);
  const change = items.stage('a', rename('Oven'));

  change.confirm((confirmed) => confirmed && { ...confirmed, name: 'Oven' });
  assert.deepEqual(items.get('a'), { id: 'a', name: 'Oven', links: ['x'] });
});

test('a failed mutation toasts unless silent, fetches again on conflict and stays quiet when signed out', () => {
  assert.deepEqual(failureOutcome('request-failed'), { toast: true, refetch: false });
  assert.deepEqual(failureOutcome('request-failed', { silent: true }), {
    toast: false,
    refetch: false,
  });
  assert.deepEqual(failureOutcome('conflict'), { toast: true, refetch: true });
  assert.deepEqual(failureOutcome('conflict', { silent: true }), { toast: false, refetch: true });
  assert.deepEqual(failureOutcome('unauthorized'), { toast: false, refetch: false });
});
