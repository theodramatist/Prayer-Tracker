// The Lists screen and each list's own page, where entries are added,
// pasted in, edited and (for weekly lists) spread over the week.

import { h, icon, toast, plural } from './ui.js';
import { LIST_TYPES, SORTS, sortItems, partitionByStatus, endLabel, datedRange, cycleSource, itemsDue, builtinEntries } from './schedule.js';
import { WEEKDAYS, MONTHS, addDays, formatMedium, formatWithYear, formatShort, parseKey } from './dates.js';
import { editionById } from './bundles.js';
import { openAddSheet, openItemSheet, openImportSheet, openListSheet, openDistributeSheet, loadSeed, ACP_URL } from './sheets.js';
import { seedFor } from './seeds.js';

function summary(list, today) {
  const n = list.items.length;
  const noun = list.sort === 'last' ? ['name', 'names'] : ['entry', 'entries'];
  let text;
  switch (list.type) {
    case 'daily': {
      const p = partitionByStatus(list.items, today);
      text = `Daily · ${plural(p.active.length, ...noun)}`;
      if (p.upcoming.length) text += ` · ${p.upcoming.length} later`;
      if (p.ended.length) text += ` · ${p.ended.length} ended`;
      break;
    }
    case 'weekly':
      text = `Weekly · ${plural(n, ...noun)}`;
      break;
    case 'monthly':
      text = `Monthly · ${plural(n, ...noun)}${n ? ` on ${plural(new Set(list.items.map((i) => i.day)).size, 'day')}` : ''}`;
      break;
    case 'dated': {
      const r = datedRange(list);
      text = r ? `By date · ${plural(n, 'date')} to ${formatWithYear(r.last)}` : 'By date · nothing added yet';
      break;
    }
    case 'cycle': {
      const src = cycleSource(list, today);
      text = src ? `Cycle · ${plural(src.length, 'day')}${src.builtin ? ' · built in' : ''}` : 'Cycle · nothing added yet';
      break;
    }
    default:
      text = '';
  }
  return list.hidden ? `${text} · hidden from Today` : text;
}

export function renderLists(app) {
  const { store } = app;
  const lists = store.state.lists;
  const reorder = !!app.reorderLists;
  const card = (l, i) => {
    const body = [h('span', { class: 'lc-name' }, l.name), h('span', { class: 'lc-meta' }, summary(l, app.today))];
    if (!reorder) {
      return h('li', null, h('a', { class: `list-card ${l.hidden ? 'is-hidden' : ''}`, href: `#/list/${l.id}` },
        h('span', { class: 'lc-body' }, body), icon('right', 'chev')));
    }
    return h('li', null, h('div', { class: 'list-card' },
      h('span', { class: 'lc-body' }, body),
      h('span', { class: 'reorder' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Move ${l.name} up`, disabled: i === 0, onclick: () => store.moveList(l.id, -1) }, icon('up')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Move ${l.name} down`, disabled: i === lists.length - 1, onclick: () => store.moveList(l.id, 1) }, icon('down')))));
  };
  return [
    h('header', { class: 'page-head' },
      h('h1', null, 'Lists'),
      h('a', { class: 'icon-btn', href: '#/settings', 'aria-label': 'Settings' }, icon('settings'))),
    h('ul', { class: 'list-cards' }, lists.map(card)),
    h('div', { class: 'page-actions' },
      h('button', { class: 'btn', type: 'button', onclick: () => openListSheet(app) }, icon('plus'), 'New list'),
      lists.length > 1 && h('button', {
        class: 'btn btn-quiet',
        type: 'button',
        onclick: () => { app.reorderLists = !reorder; app.render(); },
      }, reorder ? 'Done' : 'Change order')),
    h('p', { class: 'hint page-hint' }, 'Lists appear on Today in this order.'),
  ];
}

function row(app, item, { key, today, list = null, badge: extra = null } = {}) {
  const badge = extra || endLabel(item, today);
  return h('li', { 'data-q': `${item.text} ${item.note || ''}`.toLowerCase() },
    h('button', { class: 'row', type: 'button', onclick: () => openItemSheet(app, item.id, { list, entry: item.builtin ? item : null }) },
      key && h('span', { class: 'row-key' }, key),
      h('span', { class: 'row-main' },
        h('span', { class: 'row-text' }, item.text),
        item.note && h('span', { class: 'row-note' }, item.note)),
      badge && h('span', { class: `badge ${badge === 'Last day' ? 'badge-warn' : ''}` }, badge)));
}

function section(title, items, { action, count = true, className = '' } = {}) {
  return h('section', { class: `detail-section ${className}`.trim() },
    h('header', { class: 'detail-head' },
      h('h2', null, title, count && items.length > 0 && h('span', { class: 'count' }, String(items.length))),
      action),
    items.length ? h('ul', { class: 'rows' }, items) : null);
}

function addTo(app, list, opts, label) {
  return h('button', {
    class: 'link-btn add-to',
    type: 'button',
    'aria-label': label,
    onclick: () => openAddSheet(app, { listId: list.id, ...opts }),
  }, icon('plus'), 'Add');
}

export function renderListDetail(app, id) {
  const { store } = app;
  const list = store.list(id);
  if (!list) {
    return [h('p', { class: 'empty-note' }, 'That list no longer exists. ', h('a', { href: '#/lists' }, 'Back to Lists'))];
  }
  const today = app.today;
  const sorted = sortItems(list, list.items);
  let body;

  if (list.type === 'daily') {
    const p = partitionByStatus(sorted, today);
    body = [
      section('Praying for', p.active.map((i) => row(app, i, { today }))),
      p.upcoming.length > 0 && section('Starting later', p.upcoming.map((i) => row(app, i, { today, key: formatShort(i.start) }))),
      p.ended.length > 0 && section('Ended', p.ended.map((i) => row(app, i, { today })), {
        action: h('button', {
          class: 'link-btn',
          type: 'button',
          onclick: () => {
            const snap = store.snapshot();
            const n = store.removeEnded(list.id, today);
            toast(`Removed ${plural(n, 'ended entry', 'ended entries')}`, { action: 'Undo', onAction: () => store.restore(snap) });
          },
        }, 'Remove ended'),
      }),
    ];
    if (!list.items.length) body = [emptyState(app, list)];
  } else if (list.type === 'weekly') {
    body = WEEKDAYS.map((name, d) => section(name, sorted.filter((i) => i.day === d).map((i) => row(app, i, { today })), {
      action: addTo(app, list, { day: d }, `Add to ${name}`),
      className: 'compact',
    }));
    if (!list.items.length) body.unshift(emptyState(app, list));
  } else if (list.type === 'monthly') {
    body = Array.from({ length: 31 }, (_, k) => k + 1).map((d) => section(`Day ${d}`, sorted.filter((i) => i.day === d).map((i) => row(app, i, { today })), {
      action: addTo(app, list, { day: d }, `Add to day ${d}`),
      className: 'compact',
    }));
    if (!list.items.length) body.unshift(emptyState(app, list));
  } else if (list.type === 'cycle') {
    body = cycleBody(app, list);
  } else {
    body = datedBody(app, list, sorted);
  }

  const search = list.items.length > 12 && list.type !== 'cycle' && h('div', { class: 'search-wrap' },
    icon('search'),
    h('input', {
      type: 'search',
      class: 'input search',
      placeholder: `Find in ${list.name}`,
      'aria-label': `Find in ${list.name}`,
      oninput: (e) => filterRows(e.target.value),
    }));

  const src = cycleSource(list, app.today);
  const sub = list.type === 'cycle'
    ? [LIST_TYPES.cycle.label, src ? `${plural(src.length, 'day')} from ${formatWithYear(src.start)}, then it starts over` : 'nothing added yet']
    : [LIST_TYPES[list.type].label, `ordered by ${SORTS[list.sort].toLowerCase()}`];
  if (list.morningPrayer) sub.push('read at Morning Prayer');
  if (list.type === 'weekly' && list.everyDay) sub.push('everyone every day in your own prayer');
  if (list.hidden) sub.push('hidden from Today');

  return [
    h('header', { class: 'page-head' },
      h('a', { class: 'back-link', href: '#/lists' }, icon('left'), 'Lists'),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'List settings', onclick: () => openListSheet(app, list.id) }, icon('more'))),
    h('div', { class: 'list-title' },
      h('h1', null, list.name),
      h('p', { class: 'list-sub' }, sub.join(' · '))),
    h('div', { class: 'toolbar' },
      list.type !== 'dated' && list.type !== 'cycle' && h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => openAddSheet(app, { listId: list.id }) }, icon('plus'), 'Add'),
      h('button', { class: 'btn btn-sm', type: 'button', onclick: () => openImportSheet(app, list.id) }, icon('paste'),
        list.type === 'cycle' ? (src?.builtin ? 'Load a newer cycle' : 'Add the cycle') : list.type === 'dated' ? 'Add dates' : 'Paste a list'),
      list.type === 'weekly' && list.items.length > 1 && h('button', { class: 'btn btn-sm', type: 'button', onclick: () => openDistributeSheet(app, list.id) }, icon('spread'), 'Spread over the week'),
      list.kind === 'acp' && h('a', { class: 'btn btn-sm', href: ACP_URL, target: '_blank', rel: 'noopener' }, icon('link'), 'anglicancommunion.org'),
      list.hidden && h('button', { class: 'btn btn-sm', type: 'button', onclick: () => store.updateList(list.id, { hidden: false }) }, 'Show on Today')),
    search,
    h('div', { class: 'detail-body' }, body),
  ];
}

function datedBody(app, list, sorted) {
  if (!list.items.length) return [emptyState(app, list)];
  const today = app.today;
  const showPast = !!app.showPastDated;
  const past = sorted.filter((i) => i.date < today);
  const shown = [...sorted.filter((i) => showPast || i.date >= today)].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const byMonth = new Map();
  for (const i of shown) {
    const { y, m } = parseKey(i.date);
    const k = `${MONTHS[m - 1]} ${y}`;
    if (!byMonth.has(k)) byMonth.set(k, []);
    byMonth.get(k).push(row(app, i, { today, key: formatMedium(i.date) }));
  }
  const out = [];
  if (past.length) {
    out.push(h('button', {
      class: 'btn btn-quiet btn-sm',
      type: 'button',
      onclick: () => { app.showPastDated = !showPast; app.render(); },
    }, showPast ? 'Hide earlier dates' : `Show earlier dates (${past.length})`));
  }
  for (const [title, rows] of byMonth) out.push(section(title, rows, { count: false, className: 'dated' }));
  if (!shown.length) out.push(h('p', { class: 'empty-note' }, 'No dates from today onward. Add the next cycle when it is published.'));
  return out;
}

/** A cycle's coming days, and any entries you have changed. */
function cycleBody(app, list) {
  const src = cycleSource(list, app.today);
  if (!src) return [emptyState(app, list)];
  const days = app.cycleDays || 30;
  const rows = [];
  for (let k = 0; k < days; k++) {
    const date = addDays(app.today, k);
    for (const e of itemsDue(list, date)) {
      rows.push(row(app, e, { today: app.today, list, key: k === 0 ? 'Today' : formatMedium(date), badge: e.edited ? 'Edited' : null }));
    }
  }
  const out = [section('Coming days', rows, { count: false, className: 'dated' })];
  if (days < src.length) {
    out.push(h('button', {
      class: 'btn btn-quiet btn-sm',
      type: 'button',
      onclick: () => { app.cycleDays = Math.min(src.length, days + 60); app.render(); },
    }, 'Show more days'));
  }
  const changed = Object.entries(list.overrides || {}).filter(([, o]) => !o.reset);
  if (src.builtin && changed.length) {
    const index = (id) => Number(id.split(':')[1]);
    const items = changed.sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([id, o]) => {
      const edition = editionById(list, id.split(':')[0]);
      if (!edition) return null; // an edit to an edition no longer shipped
      const e = builtinEntries({ ...list, overrides: {} }, edition, index(id)).find((x) => x.id === id);
      if (!e) return null;
      const shown = o.hidden ? { ...e, note: 'Hidden' } : { ...e, text: o.text ?? e.text, note: o.note ?? e.note, edited: true };
      return row(app, shown, { today: app.today, list, key: `Day ${index(id) + 1}`, badge: o.hidden ? 'Hidden' : 'Edited' });
    }).filter(Boolean);
    out.push(section('Your changes', items, { className: 'dated' }));
  }
  return out;
}

function emptyState(app, list) {
  const copy = {
    daily: 'No one here yet.',
    weekly: 'No names yet. Add them one at a time, or paste a whole list. Put a day name (Sunday, Monday…) on its own line above that day’s names, or paste them all and spread them over the week.',
    monthly: 'Nothing yet. Paste your diocese’s cycle: one church per line, starting with its day number.',
    dated: 'Nothing yet. Paste in entries that each start with their date.',
    cycle: 'Nothing yet. Choose Add the cycle and pick its PDF, or paste its text: each day’s entry starting with its date.',
  }[list.type];
  const seeded = seedFor(list.id);
  return h('div', { class: 'empty-card' }, h('p', null, copy),
    seeded && seeded.part.list.type === list.type && h('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => loadSeed(app, list.id) },
      icon('check'), `Use ${seeded.part.label}`));
}

function filterRows(query) {
  const q = query.trim().toLowerCase();
  for (const li of document.querySelectorAll('.detail-body li[data-q]')) li.hidden = !!q && !li.dataset.q.includes(q);
  for (const sec of document.querySelectorAll('.detail-body .detail-section')) {
    const rows = sec.querySelectorAll('li[data-q]');
    const anyVisible = [...rows].some((li) => !li.hidden);
    sec.hidden = !!q && !anyVisible;
  }
}
