// The Today screen: everything due on the chosen date, grouped by list, with
// anything still owed from earlier days. Checking an entry off makes it slide
// away; "Show prayed" brings them back. The Collect of the Day comes first,
// then the lists read at Morning Prayer, each as one list marked once, apart
// from your own prayer below.

import { h, icon, toast, plural, prayerBody } from './ui.js';
import { agenda, carriedOver, endLabel, entryCount, officeFor } from './schedule.js';
import { formatDate, formatLong, formatMedium, formatWithYear, diffDays } from './dates.js';
import { dayTitle } from './calendar.js';
import { prayersFor, itemPrayer, isPrayerItem, firstWords, DEFAULT_RITE } from './prayers.js';
import { collectChoices, collectSource } from './collects.js';
import { keptFeasts, feastCollect, feastSource } from './lff.js';
import { openAddSheet, openItemSheet, openImportSheet, openPrayerPicker, loadSeed, ACP_URL } from './sheets.js';
import { seedFor } from './seeds.js';
import { openPrayThrough } from './praythrough.js';
import { saveBackup } from './settings.js';

const short = (s, n = 36) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function relativeDay(date, today) {
  const d = diffDays(today, date);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  return d > 0 ? `In ${d} days` : `${-d} days ago`;
}

/**
 * What the day holds: each list's entries for the date and, when it is today,
 * anything carried over from earlier days. Shared with pray-through.
 */
export function dayModel(app) {
  const { store } = app;
  const date = app.viewDate;
  const isToday = date === app.today;
  const checked = (d, id) => store.isChecked(d, id);
  const carried = isToday ? carriedOver(store.state, date, checked) : null;
  const groups = agenda(store.state, date, { carried });
  // Lists read at Morning Prayer: one check each, apart from the entries' own.
  const office = officeFor(store.state, date);
  let total = 0;
  let done = 0;
  let owed = 0;
  for (const o of office) {
    total += 1;
    if (checked(date, o.id)) done += 1;
  }
  for (const g of groups) {
    for (const i of g.items) {
      total += 1;
      if (checked(date, i.id)) done += 1;
    }
    owed += g.carried.length;
  }
  return { date, isToday, groups, office, total, done, owed, checked };
}

/** The entries still to pray, in order: each list's own, then what it carried over. */
export function pendingEntries(model) {
  return model.groups.map((g) => ({
    group: g,
    entries: [
      ...g.items.filter((i) => !model.checked(model.date, i.id)).map((item) => ({ item, date: model.date })),
      ...g.carried.map(({ item, date }) => ({ item, date, carried: true })),
    ],
  })).filter((x) => x.entries.length);
}

export function renderToday(app) {
  const model = dayModel(app);
  const { groups, total, done, owed, date } = model;

  const visible = app.filter === 'all' ? groups : groups.filter((g) => g.list.id === app.filter);
  if (app.filter !== 'all' && !visible.length) app.filter = 'all';

  const sections = [];
  for (const g of (visible.length ? visible : groups)) {
    if (g.needsSetup) {
      sections.push(setupCard(app, g.list));
      continue;
    }
    if (g.cycleEnded) sections.push(cycleEndedCard(app, g.list));
    if (!g.items.length && !g.carried.length) {
      if (app.filter === g.list.id && !g.cycleEnded) {
        sections.push(h('p', { class: 'empty-note' }, `Nothing on ${g.list.name} for this day.`));
      }
      continue;
    }
    sections.push(groupSection(app, g, model));
  }

  const all = total > 0 && done === total && owed === 0;
  // Once everything is prayed, the closing response replaces the (now empty) lists.
  const shown = all && !app.showDone && app.filter === 'all'
    ? sections.filter((el) => !el.classList.contains('group'))
    : sections;
  const nothing = total === 0 && owed === 0 && !groups.some((g) => g.needsSetup || g.cycleEnded);
  // Pray-through is for your own prayer, so Morning Prayer lists aren't in it.
  const toPray = pendingEntries(model).reduce((n, x) => n + x.entries.length, 0);
  const office = model.office
    .filter((o) => app.filter === 'all' || o.list.id === app.filter)
    .filter((o) => app.showDone || !model.checked(date, o.id));

  return [
    dayHeader(app, date),
    ...banners(app),
    total + owed > 0 && progress(done, total, owed),
    toPray > 0 && h('div', { class: 'pray-start' },
      h('button', { class: 'btn btn-pray', type: 'button', onclick: () => openPrayThrough(app) },
        icon('candle'), 'Pray through the list')),
    filterChips(app, groups, model),
    all && app.filter === 'all' && h('section', { class: 'complete-card' },
      h('span', { class: 'ornament', 'aria-hidden': 'true' }, '✠'),
      h('p', { class: 'complete-title' }, date === app.today ? 'All prayed for today.' : 'All prayed for this day.'),
      h('p', { class: 'complete-response' }, 'Thanks be to God.')),
    nothing && h('section', { class: 'empty-card' },
      h('p', { class: 'empty-title' }, 'Nothing on your lists for this day.'),
      h('p', null, 'Tap ', h('span', { class: 'inline-plus', 'aria-label': 'plus' }, '+'), ' to add a name or a prayer request.')),
    app.filter === 'all' && collectBlock(app, date),
    office.length > 0 && morningPrayer(app, office, model),
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

/** The day's title: its observance or, failing that, a lesser feast kept on it, or the season. */
function dayLine(app, date) {
  const day = dayTitle(date);
  if (day.feast) return day;
  const [f, ...others] = keptFeasts(app.lff, app.store.state.settings, date);
  if (!f) return day;
  const detail = [f.sub, ...others.map((o) => `and ${o.title}`)].filter(Boolean).join(' · ');
  return { ...day, title: f.title, detail: detail || null, lesser: true };
}

function dayHeader(app, date) {
  const isToday = date === app.today;
  const day = dayLine(app, date);
  const picker = h('input', {
    type: 'date',
    class: 'date-overlay',
    value: date,
    'aria-label': 'Choose a date',
    onchange: (e) => { if (e.target.value) app.setDate(e.target.value); },
  });
  picker.addEventListener('click', () => { try { picker.showPicker?.(); } catch { /* not allowed */ } });
  // A ribbon in the liturgical colour of the day, whatever the app's colours.
  return h('header', { class: 'day-head', 'data-color': day.color },
    h('span', { class: 'ribbon', 'aria-hidden': 'true' }),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Previous day', onclick: () => app.shiftDay(-1) }, icon('left')),
    h('div', { class: 'day-title' },
      h('p', { class: `day-rel ${isToday ? '' : 'away'}` }, relativeDay(date, app.today)),
      titleFor(date),
      h('p', { class: `feast ${day.feast ? 'is-feast' : ''} ${day.lesser ? 'is-lesser' : ''}` }, day.title),
      day.detail && h('p', { class: 'feast-detail' }, day.detail),
      picker),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Next day', onclick: () => app.shiftDay(1) }, icon('right')),
    !isToday && h('button', { class: 'pill back-today', type: 'button', onclick: () => app.setDate(app.today) }, 'Back to today'));
}

/** The date set like a calendar page: the weekday, and the day itself larger beneath. */
function titleFor(date) {
  return h('h1', { 'aria-label': formatLong(date) },
    h('span', { class: 'wd', 'aria-hidden': 'true' }, formatDate(date, { weekday: 'long' })),
    h('span', { class: 'md', 'aria-hidden': 'true' }, formatDate(date, { month: 'long', day: 'numeric' })));
}

function progressText(done, total, owed) {
  const parts = [];
  if (total) parts.push(`${done} of ${total} prayed`);
  if (owed) parts.push(`${owed} from earlier ${owed === 1 ? 'day' : 'days'}`);
  return parts.join(' · ');
}

function progress(done, total, owed) {
  const pct = total ? Math.round((done / total) * 100) : 100;
  return h('div', { class: 'progress', role: 'group', 'aria-label': 'Progress' },
    h('div', {
      class: 'progress-bar',
      role: 'progressbar',
      'aria-valuemin': '0',
      'aria-valuemax': String(total),
      'aria-valuenow': String(done),
      'aria-label': `${done} of ${total} prayed`,
    }, h('span', { style: { width: `${pct}%` } })),
    h('p', { class: 'progress-text' }, progressText(done, total, owed)));
}

function filterChips(app, groups, model) {
  const officeLeft = new Map(model.office.map((o) => [o.list.id, model.checked(model.date, o.id) ? 0 : 1]));
  const withItems = groups.filter((g) => g.items.length || g.carried.length || officeLeft.has(g.list.id) || g.list.id === app.filter);
  if (withItems.length < 2 && app.filter === 'all') return null;
  const left = (g) => g.items.filter((i) => !model.checked(model.date, i.id)).length + g.carried.length + (officeLeft.get(g.list.id) || 0);
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

/** A prayer folded until tapped, which stays open (or shut) as you move about. */
function foldedPrayer(app, key, title, text, ...after) {
  app.openPrayers ||= new Set();
  const summary = h('summary', null, h('span', { class: 'prayer-title' }, title), h('span', { class: 'prayer-first' }, firstWords(text, 40)));
  const el = h('details', { class: 'prayer', open: app.openPrayers.has(key) }, summary, prayerBody(text), ...after);
  // Remember it at the tap itself (the toggle event comes a moment later).
  summary.addEventListener('click', () => {
    if (el.open) app.openPrayers.delete(key);
    else app.openPrayers.add(key);
  });
  return el;
}

/**
 * The Collect of the Day, in the language chosen in Settings, with where to
 * find it. On a lesser feast it is the feast's, and the Prayer Book's (the
 * Sunday's, as a rule) comes after it as the other choice.
 */
function collectBlock(app, date) {
  const { settings } = app.store.state;
  if (settings.showCollect === false) return null;
  const rite = settings.rite || DEFAULT_RITE;
  const choices = collectChoices(date, rite);
  if (!choices.length) return null;
  const feasts = keptFeasts(app.lff, settings, date).map((f) => feastCollect(f, rite, app.lff));
  const source = (x) => h('p', { class: 'collect-source' }, x.book ? feastSource(x) : collectSource(x));
  const all = [...feasts, ...choices];
  return h('section', { class: 'collect-day', 'aria-label': 'The Collect of the Day', 'data-collect': all[0].id },
    all.map((x, k) => foldedPrayer(app, k ? `collect:${x.id}` : 'collect', k ? `Or: ${x.title}` : 'The Collect of the Day', x.text, source(x))));
}

/** The prayers a list opens with, each folded until tapped. */
function prayerBlock(app, list) {
  const { settings } = app.store.state;
  if (settings.showPrayers === false) return null;
  const prayers = prayersFor(list, settings.rite || DEFAULT_RITE);
  if (!prayers.length) return null;
  return prayers.map((p, k) => foldedPrayer(app, `${list.id}:${k}`, p.title, p.text));
}

function groupSection(app, g, model) {
  const pending = g.items.filter((i) => !model.checked(model.date, i.id));
  const done = g.items.filter((i) => model.checked(model.date, i.id));
  const meta = g.list.type === 'daily' || g.list.type === 'dated' ? null : g.label;
  const complete = pending.length === 0 && g.carried.length === 0;
  return h('section', { class: `group ${complete ? 'group-complete' : ''}`, 'data-list': g.list.id },
    h('header', { class: 'group-head' },
      h('h2', null, g.list.name),
      meta && h('span', { class: 'group-label' }, meta),
      h('span', {
        class: `group-count ${complete ? 'all-done' : ''}`,
        'aria-label': complete ? 'all prayed' : `${pending.length + g.carried.length} to pray`,
      }, complete ? icon('check') : String(pending.length + g.carried.length))),
    !complete && prayerBlock(app, g.list),
    pending.length > 0 && h('ul', { class: 'items' }, pending.map((i) => itemRow(app, g.list, i, false))),
    pending.length >= 3 && allPrayed(app, pending, model.date),
    g.list.kind === 'prayers' && h('div', { class: 'group-foot' },
      h('button', { class: 'link-btn', type: 'button', onclick: () => openPrayerPicker(app, g.list.id) }, icon('plus'), 'Choose prayers')),
    g.carried.length > 0 && carriedBlock(app, g),
    app.showDone && done.length > 0 && h('ul', { class: 'items items-done' }, done.map((i) => itemRow(app, g.list, i, true))));
}

/**
 * Morning Prayer: each list read there today, names only (notes stay private),
 * marked prayed once for the whole list. Your own check-offs of the same
 * people are separate and unaffected.
 */
function morningPrayer(app, offices, model) {
  return h('section', { class: 'office', 'aria-label': 'Morning Prayer' },
    h('p', { class: 'office-head' }, 'Morning Prayer'),
    offices.map((o) => officeList(app, o, model)));
}

function officeList(app, o, model) {
  const { store } = app;
  const date = model.date;
  const done = model.checked(date, o.id);
  const mark = (value) => {
    store.setChecked(date, o.id, value);
    if (value) toast(`${o.list.name}: prayed at Morning Prayer`, { action: 'Undo', onAction: () => store.setChecked(date, o.id, false) });
  };
  return h('div', { class: `office-list ${done ? 'done' : ''}`, 'data-office': o.list.id },
    h('header', { class: 'office-title' },
      h('h2', null, o.list.name),
      o.label && h('span', { class: 'group-label' }, o.label),
      h('span', { class: `group-count ${done ? 'all-done' : ''}`, 'aria-label': done ? 'prayed' : plural(o.items.length, 'name') },
        done ? icon('check') : String(o.items.length))),
    h('ol', { class: 'office-names' }, o.items.map((i) => h('li', null, i.text))),
    h('div', { class: 'office-foot' },
      done
        ? h('button', { class: 'btn btn-quiet btn-sm', type: 'button', onclick: () => mark(false) }, 'Not prayed yet')
        : h('button', { class: 'btn btn-primary btn-sm btn-office', type: 'button', onclick: () => mark(true) }, icon('check'), 'Prayed at Morning Prayer')));
}

/** For a list read out in one go: mark everyone on it at once. */
function allPrayed(app, items, date) {
  const pairs = items.map((i) => [date, i.id]);
  return h('div', { class: 'group-foot' },
    h('button', {
      class: 'link-btn',
      type: 'button',
      onclick: () => {
        app.store.setCheckedMany(pairs, true);
        toast(`Prayed for all ${items.length}`, { action: 'Undo', onAction: () => app.store.setCheckedMany(pairs, false) });
      },
    }, icon('check'), `Prayed for all ${items.length}`));
}

function carriedBlock(app, g) {
  const pairs = g.carried.map(({ item, date }) => [date, item.id]);
  return h('div', { class: 'carried' },
    h('div', { class: 'carried-head' },
      h('span', null, 'From earlier days'),
      h('button', {
        class: 'link-btn',
        type: 'button',
        onclick: () => {
          app.store.setCheckedMany(pairs, true);
          toast(`Let go of ${plural(pairs.length, 'entry', 'entries')} from earlier days`, {
            action: 'Undo',
            onAction: () => app.store.setCheckedMany(pairs, false),
          });
        },
      }, 'Let these go')),
    h('ul', { class: 'items items-carried' },
      g.carried.map(({ item, date }) => itemRow(app, g.list, item, false, { date, from: formatMedium(date) }))));
}

function itemRow(app, list, item, isDone, { date = app.viewDate, from = null } = {}) {
  const { store } = app;
  const badge = from || endLabel(item, date);
  const li = h('li', { class: `item ${isDone ? 'done' : ''}`, 'data-id': item.id });
  const check = h('button', {
    class: 'check',
    type: 'button',
    role: 'checkbox',
    'aria-checked': String(isDone),
    'aria-label': `${item.text}${from ? ` (${from})` : ''}: ${isDone ? 'prayed' : 'not yet prayed'}`,
  }, icon('check'));
  // A prayer from "Prayers and Thanksgivings": its title, and its first words.
  const prayer = isPrayerItem(item) ? itemPrayer(item, store.state.settings.rite || DEFAULT_RITE) : null;
  const body = h('button', {
    class: 'item-body',
    type: 'button',
    onclick: () => openItemSheet(app, item.id, { list, entry: item.builtin ? item : null }),
  },
  h('span', { class: 'item-text' }, item.text),
  prayer ? h('span', { class: 'item-note item-prayer' }, firstWords(prayer.text, 14)) : item.note && h('span', { class: 'item-note' }, item.note),
  badge && h('span', { class: `badge ${badge === 'Last day' ? 'badge-warn' : ''} ${from ? 'badge-from' : ''}` }, badge));
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
  const { total, done, owed } = dayModel(app);
  const bar = document.querySelector('.progress-bar');
  if (!bar) return;
  bar.firstChild.style.width = `${total ? Math.round((done / total) * 100) : 100}%`;
  bar.setAttribute('aria-valuenow', String(done));
  bar.setAttribute('aria-label', `${done} of ${total} prayed`);
  document.querySelector('.progress-text').textContent = progressText(done, total, owed);
}

const SETUP = {
  cycle: {
    text: 'The Anglican Cycle of Prayer isn’t built into this copy of the app yet. You can add it yourself from its PDF.',
    paste: 'Add the cycle',
  },
  dated: {
    text: 'Add entries for particular dates.',
    paste: 'Paste a list',
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
  const seeded = seedFor(list.id);
  const fromSeed = seeded && seeded.part.list.type === list.type;
  return h('section', { class: 'setup-card', 'data-list': list.id },
    h('h2', null, list.name),
    h('p', null, list.type === 'cycle' && list.kind !== 'acp' ? 'Paste in the cycle: each day’s entry starting with its date.' : copy.text),
    h('div', { class: 'setup-actions' },
      fromSeed && h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => loadSeed(app, list.id) }, icon('check'), `Use ${seeded.part.label}`),
      h('button', { class: `btn btn-sm ${fromSeed ? '' : 'btn-primary'}`, type: 'button', onclick: () => openImportSheet(app, list.id) }, icon('paste'), copy.paste),
      (list.type === 'weekly' || list.type === 'monthly') && h('button', { class: 'btn btn-sm', type: 'button', onclick: () => openAddSheet(app, { listId: list.id }) }, icon('plus'), 'Add one'),
      list.kind === 'acp' && h('a', { class: 'btn btn-sm', href: ACP_URL, target: '_blank', rel: 'noopener' }, icon('link'), 'Get the PDF'),
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
    h('p', null, h('strong', null, list.name), ` ended on ${formatWithYear(last)}. Add more dates to keep it going.`),
    h('div', { class: 'setup-actions' },
      h('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => openImportSheet(app, list.id) }, icon('paste'), 'Add more')));
}

function banners(app) {
  const { store } = app;
  const out = [];
  if (app.updateReady) {
    out.push(h('div', { class: 'banner', role: 'status' },
      h('p', null, 'A new version of the app is ready.'),
      h('div', { class: 'banner-actions' },
        h('button', { class: 'btn btn-sm btn-primary', type: 'button', onclick: () => location.reload() }, 'Reload now'))));
  }
  if (!store.persistent) {
    out.push(h('div', { class: 'banner banner-warn', role: 'alert' },
      h('p', null, 'This browser isn’t letting the app save (private browsing?). Changes will be lost when you close it.')));
  }
  if (app.sync?.status.state === 'error' && app.sync.status.auth) {
    out.push(h('div', { class: 'banner banner-warn', role: 'alert' },
      h('p', null, `Sync has stopped: ${app.sync.status.message}`),
      h('div', { class: 'banner-actions' }, h('a', { class: 'btn btn-sm', href: '#/settings' }, 'Open Settings'))));
  }
  const meta = store.state.meta;
  const count = store.state.lists.reduce((n, l) => n + (l.type === 'cycle' ? 0 : entryCount(l)), 0);
  const now = Date.now();
  const stale = !meta.lastBackup || now - meta.lastBackup > 30 * 864e5;
  const settledIn = now - (meta.created || now) > 3 * 864e5;
  if (count >= 10 && settledIn && stale && !app.sync?.enabled && !(meta.backupSnoozeUntil > now)) {
    out.push(h('div', { class: 'banner' },
      h('p', null, meta.lastBackup ? 'It’s been a while since your last backup.' : 'Your lists are saved only on this device. Keep a backup copy somewhere safe, or turn on sync in Settings.'),
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
