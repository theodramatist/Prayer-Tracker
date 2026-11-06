// "Reach out to": people you're reminded, while you pray for them, to get in
// touch with. Mark them in pray-through (or in an entry's sheet), and they're
// served up when you've prayed through, and on Today, until you mark them done.
// The mark is kept on the entry (see store.setReach), so it syncs with it.

import { h, icon, toast, noteParts } from './ui.js';
import { formatMedium } from './dates.js';
import { isPrayerItem } from './prayers.js';

/** Anyone on one of your own lists can go on it (not the Anglican Cycle's dioceses, nor a prayer). */
export function canReach(store, item) {
  const found = item && store.findItem(item.id);
  return !!found && found.list.type !== 'cycle' && !isPrayerItem(found.item);
}

/** Mark someone to reach out to, or take them off; says so, with Undo. Returns whether they're on it now. */
export function toggleReach(app, item, { silent = false } = {}) {
  const { store } = app;
  const was = store.findItem(item.id)?.item.reach || null;
  const now = was ? null : app.today;
  store.setReach(item.id, now, { silent });
  toast(now ? 'Added to Reach out' : 'Taken off Reach out', {
    action: 'Undo',
    onAction: () => { store.setReach(item.id, was, { silent }); app.onReachUndo?.(); },
  });
  return !!now;
}

/** The button on a person's card in pray-through. */
export function reachButton(on, onClick, name) {
  return h('button', {
    class: `btn btn-sm btn-reach ${on ? 'on' : ''}`,
    type: 'button',
    'aria-pressed': String(on),
    'aria-label': on ? `${name} is on your Reach out list` : `Remind me to reach out to ${name}`,
    onclick: onClick,
  }, icon(on ? 'check' : 'reach'), on ? 'Will reach out' : 'Reach out');
}

const since = (app, k) => (k === app.today ? 'today' : `since ${formatMedium(k)}`);

/** On Today, after the lists: everyone still to reach out to, each marked done once you have. */
export function reachSection(app, openItem) {
  const { store } = app;
  const people = store.reachOut();
  if (!people.length) return null;
  return h('section', { class: 'reach', 'aria-label': 'Reach out to' },
    h('header', { class: 'reach-head' },
      h('h2', null, 'Reach out to'),
      h('span', { class: 'group-count' }, String(people.length))),
    h('ul', { class: 'items reach-items' }, people.map(({ list, item }) => h('li', { class: 'item reach-item', 'data-item': item.id },
      h('button', { class: 'item-body', type: 'button', onclick: () => openItem(item.id) },
        h('span', { class: 'item-text' }, item.text),
        item.note && h('span', { class: 'item-note' }, noteParts(item.note)),
        h('span', { class: 'reach-from' }, `${list.name} · ${since(app, item.reach)}`)),
      h('button', {
        class: 'btn btn-sm reach-done',
        type: 'button',
        'aria-label': `Reached out to ${item.text}`,
        onclick: () => {
          const was = item.reach;
          store.setReach(item.id, null);
          toast(`Reached out to ${item.text}`, { action: 'Undo', onAction: () => store.setReach(item.id, was) });
        },
      }, icon('check'), 'Done')))));
}

/** At the end of pray-through: who to reach out to, now that you've prayed. */
export function reachSummary(app) {
  const people = app.store.reachOut();
  if (!people.length) return null;
  return h('div', { class: 'pray-reach' },
    h('p', { class: 'pray-eyebrow' }, 'Reach out to'),
    h('ul', { class: 'pray-reach-list' }, people.map(({ list, item }) => h('li', null,
      h('span', { class: 'pray-reach-name' }, item.text),
      h('span', { class: 'pray-reach-from' }, list.name)))),
    h('p', { class: 'pray-summary' }, 'They’re at the end of Today until you mark them done.'));
}
