import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Store } from '../../js/store.js';
import { TRINITY_FORM, formFields, prefilledUrl, missingAnswers, queueShare, cancelShare, flushOutbox, pendingShares } from '../../js/share.js';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}

const ANSWERS = {
  name: '  Pat Example ',
  request: 'Jane Roe – surgery Friday',
  died: false,
  sharing: 'Share my prayer request with members of the congregation, but keep my name anonymous.',
};

/** A stand-in for fetch: records each call, and fails while `offline`. */
function fakeFetch() {
  const calls = [];
  const f = async (url, init) => {
    if (f.offline) throw new TypeError('Failed to fetch');
    calls.push({ url, ...init, body: new URLSearchParams(init.body) });
    return { ok: false, status: 0, type: 'opaque' };
  };
  f.calls = calls;
  f.offline = false;
  return f;
}

test('Trinity’s form gets each answer under its own question, word for word', () => {
  assert.deepEqual(Object.fromEntries(formFields(TRINITY_FORM, ANSWERS)), {
    'entry.597871476': 'Pat Example',
    'entry.670633233': 'Jane Roe – surgery Friday',
    'entry.764039509': 'No',
    'entry.1294983933': 'Share my prayer request with members of the congregation, but keep my name anonymous.',
  });
  assert.equal(formFields(TRINITY_FORM, { ...ANSWERS, died: true }).get('entry.764039509'), 'Yes');
  const url = new URL(prefilledUrl(TRINITY_FORM, ANSWERS));
  assert.equal(url.origin + url.pathname, 'https://docs.google.com/forms/d/e/1FAIpQLSceBPekpqOMedX0hZYr27AjsuaDFwjs0W_eftoAQvaK197Q3Q/viewform');
  assert.equal(url.searchParams.get('usp'), 'pp_url');
  assert.equal(url.searchParams.get('entry.597871476'), 'Pat Example');
  // The form requires a name, the request, and one of its own sharing choices.
  assert.deepEqual(missingAnswers(TRINITY_FORM, ANSWERS), []);
  assert.deepEqual(missingAnswers(TRINITY_FORM, { ...ANSWERS, name: ' ', request: '', sharing: 'Everyone' }), ['name', 'request', 'sharing']);
});

test('a shared request waits in the outbox, goes to the form, and marks its entry shared', async () => {
  let now = Date.parse('2026-11-04T15:00:00Z');
  const store = new Store(memoryStorage(), { clock: () => now });
  const [jane] = store.addItems('requests', [{ text: 'Jane Roe – surgery Friday' }]);
  const fetch = fakeFetch();
  queueShare(store, { itemIds: [jane.id], answers: ANSWERS });
  assert.equal(pendingShares(store).length, 1);

  // Not while it can still be undone…
  assert.deepEqual(await flushOutbox(store, { fetchImpl: fetch, minAge: 5000 }), { sent: 0, waiting: 1 });
  assert.equal(fetch.calls.length, 0);
  // …then it goes.
  now += 6000;
  assert.deepEqual(await flushOutbox(store, { fetchImpl: fetch, minAge: 5000 }), { sent: 1, waiting: 0 });
  assert.equal(fetch.calls.length, 1);
  const [call] = fetch.calls;
  assert.equal(call.url, TRINITY_FORM.send);
  assert.equal(call.method, 'POST');
  assert.equal(call.mode, 'no-cors');
  assert.equal(call.body.get('entry.670633233'), 'Jane Roe – surgery Friday');
  assert.deepEqual(store.list('requests').items[0].shared, { trinity: '2026-11-04' });
  // Nothing is sent twice.
  await flushOutbox(store, { fetchImpl: fetch });
  assert.equal(fetch.calls.length, 1);
});

test('offline, a request keeps waiting; Undo and deleted entries stop it going', async () => {
  const store = new Store(memoryStorage(), { clock: () => Date.parse('2026-11-04T15:00:00Z') });
  const [a, b, c] = store.addItems('requests', [{ text: 'A' }, { text: 'B' }, { text: 'C' }]);
  const fetch = fakeFetch();
  fetch.offline = true;
  queueShare(store, { itemIds: [a.id], answers: { ...ANSWERS, request: 'A' } });
  assert.deepEqual(await flushOutbox(store, { fetchImpl: fetch }), { sent: 0, waiting: 1 });
  assert.equal(store.list('requests').items[0].shared, undefined);

  const undone = queueShare(store, { itemIds: [b.id], answers: { ...ANSWERS, request: 'B' } });
  cancelShare(store, undone);
  queueShare(store, { itemIds: [c.id], answers: { ...ANSWERS, request: 'C' } });
  store.deleteItem(c.id);

  // The outbox lasts across a restart of the app.
  const again = new Store(store.storage, { clock: store.clock });
  fetch.offline = false;
  assert.deepEqual(await flushOutbox(again, { fetchImpl: fetch }), { sent: 1, waiting: 0 });
  assert.deepEqual(fetch.calls.map((x) => x.body.get('entry.670633233')), ['A']);
  assert.deepEqual(again.list('requests').items.find((i) => i.text === 'A').shared, { trinity: '2026-11-04' });
});
