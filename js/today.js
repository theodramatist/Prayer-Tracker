// The Today screen: everything due on the chosen date, grouped by list.
// Checking an item off makes it slide away; "Show prayed" brings them back.

import { h, icon, toast, plural } from './ui.js';
import { agenda, endLabel } from './schedule.js';
import { formatLong, formatWithYear, diffDays } from './dates.js';
import { season } from './liturgy.js';
import { openAddSheet, openItemSheet, openImportSheet, ACP_URL } from './sheets.js';
import { saveBackup } from './settings.js';

const short = (s, n = 36) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function relativeDay(date, today) {
  const d = diffDays(today, date);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  return d > 0 ? `In ${d} days` : `${-d} days ago`;
}

export function renderToday(app) {
  const { store } = app;
  const date = app.viewDate;
  const groups = agenda(store.state, date);
  const isChecked = (i) => store.isChecked(date, i.id);

  let total = 0;
  let done = 0;
  for (const g of groups) {
    for (const i of g.items) {
      total += 1;
      if (isChecked(i)) done += 1;
    }
  }

  const visible = app.filter === 'all' ? groups : groups.filter((g) => g.list.id === app.filter);
  if (app.filter !== 'all' && !visible.length) app.filter = 'all';

  const sections = [];
  for (const g of (visible.length ? visible : groups)) {
    if (g.needsSetup) {
      sections.push(setupCard(app, g.list));
      continue;
    }
    if (g.cycleEnded) sections.push(cycleEndedCard(app, g.list));
    if (!g.items.length) {
      if (app.filter === g.list.id && !g.cycleEnded) {
        sections.push(h('p', { class: 'empty-note' }, `Nothing on ${g.list.name} for this day.`));
      }
      continue;
    }
    sections.push(groupSection(app, g, isChecked));
  }

  const all = total > 0 && done === total;
  // Once everything is prayed, the closing response replaces the (now empty) lists.
  const shown = all && !app.showDone && app.filter === 'all'
    ? sections.filter((el) => !el.classList.contains('group'))
    : sections;
  const nothing = total === 0 && !groups.some((g) => g.needsSetup || g.cycleEnded);

  return [
    dayHeader(app, date),
    ...banners(app),
    total > 0 && progress(done, total),
    filterChips(app, groups, isChecked),
    all && app.filter === 'all' && h('section', { class: 'complete-card' },
      icon('candle', 'complete-icon'),
      h('p', { class: 'complete-title' }, date === app.today ? 'All prayed for today.' : 'All prayed for this day.'),
      h('p', { class: 'complete-response' }, 'Thanks be to God.')),
    nothing && h('section', { class: 'empty-card' },
      h('p', { class: 'empty-title' }, 'Nothing on your lists for this day.'),
      h('p', null, 'Tap ', h('span', { class: 'inline-plus', 'aria-label': 'plus' }, '+'), ' to add a name or a prayer request.')),
    ...shown,
    done > 0 && h('div', { class: 'show-done' },
      h('button', {
        class: 'btn btn-quiet',
        type: 'button',
        'aria-pressed': String(app.showDone),
        onclick: () => { app.showDone = !app.showDone; app.render(); },
      }, icon('eye'), app.showDone ? 'Hide prayed' : `Show prayed (${done})`)),
  ];
}

function dayHeader(app, date) {
  const isToday = date === app.today;
  const picker = h('input', {
    type: 'date',
    class: 'date-overlay',
    value: date,
    'aria-label': 'Choose a date',
    onchange: (e) => { if (e.target.value) app.setDate(e.target.value); },
  });
  picker.addEventListener('click', () => { try { picker.showPicker?.(); } catch { /* not allowed */ } });
  return h('header', { class: 'day-head' },
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Previous day', onclick: () => app.shiftDay(-1) }, icon('left')),
    h('div', { class: 'day-title' },
      h('p', { class: `day-rel ${isToday ? '' : 'away'}` }, relativeDay(date, app.today)),
      titleFor(date),
      h('p', { class: 'season' }, season(date).name),
      picker),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Next day', onclick: () => app.shiftDay(1) }, icon('right')),
    !isToday && h('button', { class: 'pill back-today', type: 'button', onclick: () => app.setDate(app.today) }, 'Back to today'));
}

/** The date as the page title, a little smaller when it's a long one ("Wednesday, September 30"). */
function titleFor(date) {
  const text = formatLong(date);
  const size = text.length > 21 ? 'longer' : text.length > 18 ? 'long' : '';
  return h('h1', { class: size }, text);
}

function progress(done, total) {
  const pct = Math.round((done / total) * 100);
  return h('div', { class: 'progress', role: 'group', 'aria-label': 'Progress' },
    h('div', {
      class: 'progress-bar',
      role: 'progressbar',
      'aria-valuemin': '0',
      'aria-valuemax': String(total),
      'aria-valuenow': String(done),
      'aria-label': `${done} of ${total} prayed`,
    }, h('span', { style: { width: `${pct}%` } })),
    h('p', { class: 'progress-text' }, `${done} of ${total} prayed`));
}

function filterChips(app, groups, isChecked) {
  const withItems = groups.filter((g) => g.items.length || g.list.id === app.filter);
  if (withItems.length < 2 && app.filter === 'all') return null;
  const left = (g) => g.items.filter((i) => !isChecked(i)).length;
  const totalLeft = withItems.reduce((n, g) => n + left(g), 0);
  const chip = (value, label, count) => h('button', {
    type: 'button',
    class: `chip ${app.filter === value ? 'on' : ''}`,
    'aria-pressed': String(app.filter === value),
    onclick: () => app.setFilter(value),
  }, label, count > 0 && h('span', { class: 'chip-sub' }, String(count)));
  return h('div', { class: 'chips filter-chips', role: 'toolbar', 'aria-label': 'Show one list' },
    chip('all', 'All', totalLeft),
    withItems.map((g) => chip(g.list.id, g.list.name, left(g))));
}

function groupSection(app, g, isChecked) {
  const pending = g.items.filter((i) => !isChecked(i));
  const done = g.items.filter(isChecked);
  const meta = g.list.type === 'daily' || g.list.type === 'dated' ? null : g.label;
  const complete = pending.length === 0;
  return h('section', { class: `group ${complete ? 'group-complete' : ''}`, 'data-list': g.list.id },
    h('header', { class: 'group-head' },
      h('h2', null, g.list.name),
      meta && h('span', { class: 'group-label' }, meta),
      h('span', {
        class: `group-count ${complete ? 'all-done' : ''}`,
        'aria-label': complete ? 'all prayed' : `${pending.length} to pray`,
      }, complete ? icon('check') : String(pending.length))),
    !complete && h('ul', { class: 'items' }, pending.map((i) => itemRow(app, i, false))),
    app.showDone && done.length > 0 && h('ul', { class: 'items items-done' }, done.map((i) => itemRow(app, i, true))));
}

function itemRow(app, item, isDone) {
  const { store } = app;
  const date = app.viewDate;
  const badge = endLabel(item, date);
  const li = h('li', { class: `item ${isDone ? 'done' : ''}`, 'data-id': item.id });
  const check = h('button', {
    class: 'check',
    type: 'button',
    role: 'checkbox',
    'aria-checked': String(isDone),
    'aria-label': `${item.text}: ${isDone ? 'prayed' : 'not yet prayed'}`,
  }, icon('check'));
  const body = h('button', { class: 'item-body', type: 'button', onclick: () => openItemSheet(app, item.id) },
    h('span', { class: 'item-text' }, item.text),
    item.note && h('span', { class: 'item-note' }, item.note),
    badge && h('span', { class: `badge ${badge === 'Last day' ? 'badge-warn' : ''}` }, badge));
  li.append(check, body);

  check.addEventListener('click', () => {
    if (isDone) {
      store.setChecked(date, item.id, false);
      return;
    }
    if (li.classList.contains('checked')) return;
    store.setChecked(date, item.id, true, { silent: true });
    li.classList.add('checked');
    check.setAttribute('aria-checked', 'true');
    refreshProgress(app);
    toast(`Prayed for ${short(item.text)}`, {
      action: 'Undo',
      onAction: () => store.setChecked(date, item.id, false),
    });
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (app.showDone || reduce) {
      app.render();
      return;
    }
    setTimeout(() => {
      li.style.height = `${li.offsetHeight}px`;
      void li.offsetHeight;
      li.classList.add('leaving');
      li.style.height = '0px';
      setTimeout(() => app.render(), 300);
    }, 200);
  });
  return li;
}

/** Update the bar and counts right away, before the row finishes sliding out. */
function refreshProgress(app) {
  const groups = agenda(app.store.state, app.viewDate);
  let total = 0;
  let done = 0;
  for (const g of groups) {
    for (const i of g.items) {
      total += 1;
      if (app.store.isChecked(app.viewDate, i.id)) done += 1;
    }
  }
  const bar = document.querySelector('.progress-bar');
  if (!bar) return;
  bar.firstChild.style.width = `${Math.round((done / total) * 100)}%`;
  bar.setAttribute('aria-valuenow', String(done));
  bar.setAttribute('aria-label', `${done} of ${total} prayed`);
  document.querySelector('.progress-text').textContent = `${done} of ${total} prayed`;
}

const SETUP = {
  dated: {
    text: 'Add the Anglican Cycle of Prayer once, and each day’s diocese or province will appear here.',
    paste: 'Add the cycle',
  },
  monthly: {
    text: 'Paste in your diocese’s cycle of prayer: a church for each day of the month.',
    paste: 'Paste a list',
  },
  weekly: {
    text: 'Add the names for each day of the week. Type them First Last; they’ll be sorted by last name.',
    paste: 'Paste names',
  },
};

function setupCard(app, list) {
  const copy = SETUP[list.type];
  return h('section', { class: 'setup-card', 'data-list': list.id },
    h('h2', null, list.name),
    h('p', null, copy.text),
    h('div', { class: 'setup-actions' },
      h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => openImportSheet(app, list.id) }, icon('paste'), copy.paste),
      list.type !== 'dated' && h('button', { class: 'btn btn-sm', type: 'button', onclick: () => openAddSheet(app, { listId: list.id }) }, icon('plus'), 'Add one'),
      list.kind === 'acp' && h('a', { class: 'btn btn-sm', href: ACP_URL, target: '_blank', rel: 'noopener' }, icon('link'), 'Get the cycle'),
      h('button', {
        class: 'link-btn',
        type: 'button',
        onclick: () => {
          app.store.updateList(list.id, { hidden: true });
          toast(`${list.name} is hidden. Show it again from Lists.`, {
            action: 'Undo',
            onAction: () => app.store.updateList(list.id, { hidden: false }),
          });
        },
      }, 'Not now')));
}

function cycleEndedCard(app, list) {
  const last = list.items.reduce((m, i) => (i.date > m ? i.date : m), '');
  return h('section', { class: 'notice-card' },
    h('p', null, h('strong', null, list.name), ` ends on ${formatWithYear(last)}. When the next cycle is published, add it here.`),
    h('div', { class: 'setup-actions' },
      h('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => openImportSheet(app, list.id) }, icon('paste'), 'Add the new cycle'),
      list.kind === 'acp' && h('a', { class: 'btn btn-sm', href: 'https://www.anglicancommunion.org/', target: '_blank', rel: 'noopener' }, icon('link'), 'anglicancommunion.org')));
}

function banners(app) {
  const { store } = app;
  const out = [];
  if (!store.persistent) {
    out.push(h('div', { class: 'banner banner-warn', role: 'alert' },
      h('p', null, 'This browser isn’t letting the app save (private browsing?). Changes will be lost when you close it.')));
  }
  const meta = store.state.meta;
  const count = store.state.lists.reduce((n, l) => n + (l.type === 'dated' ? 0 : l.items.length), 0);
  const now = Date.now();
  const stale = !meta.lastBackup || now - meta.lastBackup > 30 * 864e5;
  const settledIn = now - (meta.created || now) > 3 * 864e5;
  if (count >= 10 && settledIn && stale && !(meta.backupSnoozeUntil > now)) {
    out.push(h('div', { class: 'banner' },
      h('p', null, meta.lastBackup ? 'It’s been a while since your last backup.' : 'Your lists are saved only on this device. Keep a backup copy somewhere safe.'),
      h('div', { class: 'banner-actions' },
        h('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => saveBackup(app) }, icon('download'), 'Save a backup'),
        h('button', { class: 'link-btn', type: 'button', onclick: () => store.setMeta('backupSnoozeUntil', now + 14 * 864e5) }, 'Later'))));
  }
  if (app.platform.ios && !app.platform.standalone && !meta.installHintDismissed) {
    out.push(h('div', { class: 'banner' },
      h('p', null, 'To keep this on your Home Screen: tap ', h('strong', null, 'Share'), ', then ', h('strong', null, 'Add to Home Screen'), '.'),
      h('div', { class: 'banner-actions' },
        h('button', { class: 'link-btn', type: 'button', onclick: () => store.setMeta('installHintDismissed', true) }, 'Got it'))));
  }
  return out;
}

