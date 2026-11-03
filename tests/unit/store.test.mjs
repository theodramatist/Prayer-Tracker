import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Store, STORAGE_KEY, migrate, defaultState } from '../../js/store.js';
import { itemsDue } from '../../js/schedule.js';
import { endDateFor } from '../../js/schedule.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

test('first run creates the four cycles and the daily lists', () => {
  const store = new Store(memoryStorage());
  const types = store.state.lists.map((l) => [l.id, l.type]);
  assert.deepEqual(types, [
    ['anglican', 'dated'], ['diocese', 'monthly'], ['trinity', 'weekly'],
    ['requests', 'daily'], ['family', 'daily'], ['clergy', 'daily'],
  ]);
  assert.equal(store.list('trinity').sort, 'last');
});

test('items persist across reloads; corrupt data is kept aside, not lost', () => {
  const storage = memoryStorage();
  const a = new Store(storage);
  a.addItems('family', [{ text: 'Mom' }, { text: '  ' }, { text: 'Dad', note: 'knee' }]);
  const b = new Store(storage);
  assert.deepEqual(b.list('family').items.map((i) => [i.text, i.note]), [['Mom', undefined], ['Dad', 'knee']]);

  const bad = memoryStorage({ [STORAGE_KEY]: '{not json' });
  const c = new Store(bad);
  assert.equal(c.state.lists.length, 6);
  assert.ok(Object.keys(bad.data).some((k) => k.startsWith(`${STORAGE_KEY}:unreadable:`)));
});

test('works without storage (private mode) and reports it', () => {
  const store = new Store(null);
  assert.equal(store.persistent, false);
  store.addItems('family', [{ text: 'Mom' }]);
  assert.equal(store.list('family').items.length, 1);
});

test('people lists flip "Last, First" for display and keep the last name for sorting', () => {
  const store = new Store(memoryStorage());
  const [a, b, c] = store.addItems('trinity', [
    { text: 'de la Cruz, Maria', day: 1 },
    { text: 'Ann Zeller', day: 1 },
    { text: 'Last, First', first: 'Bo', last: 'Adams', day: 1 },
  ]);
  assert.equal(a.text, 'Maria de la Cruz');
  assert.equal(a.last, 'de la Cruz');
  assert.equal(b.last, undefined); // parsed on the fly
  assert.equal(c.last, 'Adams');
  const order = itemsDue(store.list('trinity'), '2026-11-02').map((i) => i.text);
  assert.deepEqual(order, ['Last, First', 'Maria de la Cruz', 'Ann Zeller']);
  // Non-people lists keep commas as typed.
  const [r] = store.addItems('requests', [{ text: 'Peace in Sudan, Gaza and Ukraine' }]);
  assert.equal(r.text, 'Peace in Sudan, Gaza and Ukraine');
});

test('day numbers are validated for the list type', () => {
  const store = new Store(memoryStorage());
  const [w] = store.addItems('trinity', [{ text: 'X Y', day: 15 }]);
  assert.equal(w.day, 0);
  const [m] = store.addItems('diocese', [{ text: 'St Paul', day: 31 }]);
  assert.equal(m.day, 31);
  assert.deepEqual(store.addItems('anglican', [{ text: 'no date' }]), []);
});

test('update, move, delete and undo', () => {
  const store = new Store(memoryStorage());
  const [item] = store.addItems('requests', [{ text: 'Jane', start: '2026-11-02', end: '2026-11-08' }]);
  store.updateItem(item.id, { text: 'Jane Doe', note: 'surgery', end: null });
  let found = store.findItem(item.id);
  assert.equal(found.item.text, 'Jane Doe');
  assert.equal(found.item.end, undefined);
  assert.equal(found.item.note, 'surgery');

  store.moveItem(item.id, 'trinity', { day: 3 });
  found = store.findItem(item.id);
  assert.equal(found.list.id, 'trinity');
  assert.equal(found.item.day, 3);
  assert.equal(store.list('requests').items.length, 0);

  // Renaming while moving into a people list re-reads the last name.
  const [tom] = store.addItems('trinity', [{ text: 'Smith, Tom', day: 1 }]);
  assert.equal(tom.last, 'Smith');
  store.moveItem(tom.id, 'clergy', { text: 'Tom Smyth' });
  assert.equal(store.findItem(tom.id).item.last, undefined);
  assert.equal(store.findItem(tom.id).item.text, 'Tom Smyth');

  const removed = store.deleteItem(item.id);
  assert.equal(store.findItem(item.id), null);
  store.restoreItem(removed);
  assert.equal(store.findItem(item.id).item.text, 'Jane Doe');
});

test('check-offs are per date and old ones are pruned', () => {
  const storage = memoryStorage();
  const store = new Store(storage);
  const [item] = store.addItems('family', [{ text: 'Mom' }]);
  store.setChecked('2026-11-02', item.id, true);
  assert.ok(store.isChecked('2026-11-02', item.id));
  assert.ok(!store.isChecked('2026-11-03', item.id));
  store.setChecked('2026-11-02', item.id, false);
  assert.deepEqual(store.state.checks, {});
  store.setChecked('2020-01-01', item.id, true);
  store.pruneChecks('2026-11-02');
  assert.deepEqual(store.state.checks, {});
});

test('distribute a weekly list alphabetically, keeping shared last names together', () => {
  const store = new Store(memoryStorage());
  const names = ['Ann Adams', 'Bob Baker', 'Cy Baker', 'Di Baker', 'Ed Clark', 'Flo Davis', 'Gus Evans',
    'Hal Fox', 'Ivy Green', 'Jo Hill', 'Kim Irwin', 'Lu Jones', 'Mo King', 'Ned Lee'];
  store.addItems('trinity', names.map((text) => ({ text })));
  store.distributeWeekly('trinity');
  const byDay = Array.from({ length: 7 }, (_, d) => itemsDue(store.list('trinity'), `2026-11-0${d + 1}`).map((i) => i.text));
  // 2026-11-01 is a Sunday, so index 0 = Sunday.
  assert.deepEqual(byDay[0], ['Ann Adams', 'Bob Baker', 'Cy Baker', 'Di Baker']);
  assert.equal(byDay.flat().length, names.length);
  for (const day of byDay.slice(1)) assert.ok(day.length >= 1 && day.length <= 2);

  store.distributeWeekly('trinity', [1, 2, 3, 4, 5, 6]);
  assert.equal(itemsDue(store.list('trinity'), '2026-11-01').length, 0);
});

test('lists: add, rename, hide, reorder, delete', () => {
  const store = new Store(memoryStorage());
  const list = store.addList({ name: 'Godchildren', type: 'daily' });
  store.updateList(list.id, { name: 'Godchildren & friends', hidden: true });
  assert.equal(store.list(list.id).hidden, true);
  store.updateList(list.id, { hidden: false });
  assert.equal('hidden' in store.list(list.id), false);
  store.moveList(list.id, -1);
  assert.equal(store.state.lists[5].id, list.id);
  store.setMeta('quickAddList', list.id);
  store.deleteList(list.id);
  assert.equal(store.list(list.id), null);
  assert.equal(store.state.meta.quickAddList, 'requests');
});

test('backup export/import round-trip and validation', () => {
  const a = new Store(memoryStorage());
  a.addItems('family', [{ text: 'Mom' }]);
  a.setSetting('seasonalColor', false);
  const file = JSON.parse(JSON.stringify(a.exportData()));
  const b = new Store(memoryStorage());
  b.importData(file);
  assert.equal(b.list('family').items[0].text, 'Mom');
  assert.equal(b.state.settings.seasonalColor, false);
  assert.throws(() => b.importData({ hello: 'world' }));
  assert.equal(b.list('family').items[0].text, 'Mom'); // unchanged after a bad import
  assert.throws(() => migrate(null));
  const m = migrate({ lists: [{ id: 'x', type: 'bogus', items: [] }, { id: 'y', type: 'daily', items: [{ text: 'ok' }, { nope: 1 }] }] });
  assert.equal(m.lists.length, 1);
  assert.equal(m.lists[0].items.length, 1);
  assert.equal(typeof m.lists[0].items[0].id, 'string');
  assert.deepEqual(Object.keys(m.settings), Object.keys(defaultState().settings));
});

test('snapshot/restore undoes bulk changes', () => {
  const store = new Store(memoryStorage());
  store.addItems('diocese', [{ text: 'A', day: 1 }]);
  const snap = store.snapshot();
  store.replaceItems('diocese', [{ text: 'B', day: 2 }, { text: 'C', day: 3 }]);
  assert.equal(store.list('diocese').items.length, 2);
  store.restore(snap);
  assert.deepEqual(store.list('diocese').items.map((i) => i.text), ['A']);
});

test('durations', () => {
  assert.equal(endDateFor('ongoing', '2026-11-02'), null);
  assert.equal(endDateFor('day', '2026-11-02'), '2026-11-02');
  assert.equal(endDateFor('3d', '2026-11-02'), '2026-11-04');
  assert.equal(endDateFor('1w', '2026-11-02'), '2026-11-08');
  assert.equal(endDateFor('2w', '2026-11-02'), '2026-11-15');
  assert.equal(endDateFor('1m', '2026-11-02'), '2026-12-01');
  assert.equal(endDateFor('1m', '2026-01-31'), '2026-02-27');
  assert.equal(endDateFor('3m', '2026-11-02'), '2027-02-01');
  assert.equal(endDateFor('until', '2026-11-02', '2026-12-25'), '2026-12-25');
  assert.equal(endDateFor('until', '2026-11-02', '2026-10-01'), null);
});
