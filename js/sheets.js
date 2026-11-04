// Bottom sheets: quick add, edit an item, share a request with Trinity,
// paste a list, list settings, and spreading a weekly list over the week.

import { h, icon, replace, openSheet, confirmSheet, toast, chipGroup, toggle, autoGrow, plural } from './ui.js';
import { DURATIONS, endDateFor, sortItems, nameOf, planSpread, LIST_TYPES, SORTS, cycleSource } from './schedule.js';
import { PRAYERS, SOURCE as PRAYER_SOURCE, prayerFor } from './prayers.js';
import { bundleFor } from './bundles.js';
import { seedFor } from './seeds.js';
import { TRINITY_FORM, prefilledUrl, queueShare, cancelShare, flushOutbox, shareName, sharingChoice } from './share.js';
import { parseList, parseWeekly, parseMonthly, parseDated } from './importer.js';
import { parseName, compareNames } from './names.js';
import { WEEKDAYS, WEEKDAYS_SHORT, addDays, diffDays, formatShort, formatMedium, formatWithYear, weekday, parseKey, isValidKey, todayKey } from './dates.js';
import { isPdf, pdfToText } from './pdf.js';

/** Where the Anglican Communion publishes each edition of the cycle (as its PDF says). */
export const ACP_URL = 'https://www.anglicancommunion.org/prayer';

const field = (label, ...children) => h('div', { class: 'field' }, label && h('span', { class: 'field-label' }, label), children);

/** Days a weekly list is spread over: the ones used last time, or Monday to Friday. */
export const spreadDaysFor = (list) => (Array.isArray(list.spreadDays) && list.spreadDays.length ? [...list.spreadDays] : [1, 2, 3, 4, 5]);

/** Weekday chips that can each be turned on or off (at least one stays on). */
function dayChips(days, onChange) {
  let current = [...days];
  return h('div', { class: 'chips chips-wrap chips-spread', role: 'group', 'aria-label': 'Days to use' },
    WEEKDAYS_SHORT.map((d, i) => {
      const on = current.includes(i);
      const b = h('button', {
        type: 'button',
        class: `chip ${on ? 'on' : ''}`,
        'aria-pressed': String(on),
        onclick: () => {
          const was = current.includes(i);
          if (was && current.length === 1) return;
          current = was ? current.filter((x) => x !== i) : [...current, i].sort();
          b.classList.toggle('on', !was);
          b.setAttribute('aria-pressed', String(!was));
          onChange(current);
        },
      }, d);
      return b;
    }));
}

/** One line per day: who falls on it ("Adams – Cole, 40 names"). */
function spreadPreview(plan) {
  return plan.map(({ day, items }) => {
    const first = items[0] && nameOf(items[0]).last;
    const last = items.length > 1 && nameOf(items[items.length - 1]).last;
    return h('li', null,
      h('span', { class: 'preview-key' }, WEEKDAYS[day]),
      h('span', { class: 'preview-text' }, first ? `${first}${last && last !== first ? ` – ${last}` : ''}` : '—',
        h('span', { class: 'preview-note' }, plural(items.length, 'name'))));
  });
}

/**
 * Fill a list from the built-in cycle it came with (such as the diocese's),
 * in place of whatever it has now. Asks first if that would replace entries.
 */
export async function loadSeed(app, listId, { onDone } = {}) {
  const { store } = app;
  const list = store.list(listId);
  const found = seedFor(listId);
  if (!list || !found) return false;
  const { seed, part } = found;
  if (list.items.length) {
    const ok = await confirmSheet({
      title: `Replace ${list.name}?`,
      message: `Its ${plural(list.items.length, 'entry', 'entries')} are replaced by the ${plural(part.entries.length, 'entry', 'entries')} in ${part.label}, including any changes you made to them.`,
      confirm: 'Replace',
      danger: true,
    });
    if (!ok) return false;
  }
  const snap = store.snapshot();
  const n = store.reloadSeed(seed, listId);
  if (list.hidden) store.updateList(listId, { hidden: false });
  onDone?.();
  toast(`${list.name}: ${plural(n, 'entry', 'entries')} from ${part.label}`, { action: 'Undo', onAction: () => store.restore(snap) });
  return true;
}

function requestPersistentStorage() {
  try { navigator.storage?.persist?.(); } catch { /* not supported */ }
}

const short = (s, n = 42) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// ---------- suggestions ----------

/** Best weekday for a new name: its alphabetical slot if the list is spread A–Z, else the emptiest day in use. */
export function suggestWeekday(list, text, fallbackDate) {
  // The days chosen when the list was spread; a list read at Morning Prayer starts on weekdays.
  const allowed = Array.isArray(list.spreadDays) && list.spreadDays.length ? list.spreadDays : null;
  if (!list.items.length) {
    const d = weekday(fallbackDate);
    const days = allowed || (list.morningPrayer ? [1, 2, 3, 4, 5] : null);
    return !days || days.includes(d) ? d : days[0];
  }
  const sorted = sortItems({ ...list, sort: 'last' }, list.items);
  const days = sorted.map((i) => i.day);
  const alphabetical = days.every((d, k) => k === 0 || d >= days[k - 1]);
  if (alphabetical && text.trim()) {
    const p = parseName(text.split('\n')[0]);
    const idx = sorted.findIndex((i) => compareNames(nameOf(i), p) > 0);
    if (idx === -1) return sorted[sorted.length - 1].day;
    return sorted[Math.max(0, idx - 1)].day;
  }
  const counts = Array(7).fill(0);
  for (const i of list.items) counts[i.day] = (counts[i.day] || 0) + 1;
  const used = counts.map((c, d) => [c, d]).filter(([c, d]) => c > 0 && (!allowed || allowed.includes(d)));
  const pool = used.length ? used : counts.map((c, d) => [c, d]).filter(([, d]) => !allowed || allowed.includes(d));
  return pool.reduce((best, cur) => (cur[0] < best[0] ? cur : best))[1];
}

function suggestMonthDay(list, fallbackDate) {
  const counts = Array(32).fill(0);
  for (const i of list.items) counts[i.day] += 1;
  if (!list.items.length) return parseKey(fallbackDate).d;
  for (let d = 1; d <= 31; d++) if (!counts[d]) return d;
  let best = 1;
  for (let d = 2; d <= 31; d++) if (counts[d] < counts[best]) best = d;
  return best;
}

// ---------- pickers ----------

function weekdayPicker(list, value, onChange) {
  const counts = Array(7).fill(0);
  for (const i of list?.items || []) if (i.day >= 0 && i.day <= 6) counts[i.day]++;
  return chipGroup({
    label: 'Day of the week',
    className: 'chips-days',
    wrap: true,
    value,
    onChange,
    options: WEEKDAYS_SHORT.map((d, i) => ({ value: i, label: d, sub: list ? counts[i] : null })),
  });
}

function monthDayPicker(list, value, onChange) {
  const counts = Array(32).fill(0);
  for (const i of list?.items || []) counts[i.day] = (counts[i.day] || 0) + 1;
  const grid = h('div', { class: 'month-grid', role: 'radiogroup', 'aria-label': 'Day of the month' });
  const render = (current) => {
    grid.replaceChildren(...Array.from({ length: 31 }, (_, k) => {
      const d = k + 1;
      return h('button', {
        type: 'button',
        class: `day-cell ${d === current ? 'on' : ''} ${counts[d] ? 'has' : ''}`,
        role: 'radio',
        'aria-checked': String(d === current),
        'aria-label': `Day ${d}${counts[d] ? `, ${plural(counts[d], 'entry', 'entries')}` : ''}`,
        onclick: () => { render(d); onChange(d); },
      }, String(d));
    }));
  };
  render(value);
  return grid;
}

function dateInput(value, onChange, label = 'Date') {
  return h('input', {
    type: 'date',
    class: 'input',
    value,
    'aria-label': label,
    onchange: (e) => { if (isValidKey(e.target.value)) onChange(e.target.value); },
  });
}

// ---------- quick add ----------

const TYPE_ORDER = ['daily', 'weekly', 'monthly', 'dated'];

// ---------- sharing a request with Trinity ----------

/** Lists whose entries can be shared with Trinity's prayer list: your own daily ones. */
export const canShare = (list) => list?.type === 'daily';

/**
 * Trinity's prayer request form, under a "Share with Trinity" switch (unless
 * `fixed`). Your name comes from Settings and the request is the entry as you
 * wrote it, so only the form's other two questions are asked here. The
 * sharing choice is remembered for next time.
 */
function shareFields(app, { fixed = false, preview = null } = {}) {
  const { store } = app;
  const form = TRINITY_FORM;
  let on = fixed;
  let died = false;
  let sharing = sharingChoice(store);
  const group = `share-${Math.random().toString(36).slice(2, 8)}`;
  const choices = h('div', { class: 'radio-list', role: 'radiogroup', 'aria-label': 'Who would you like your prayer request shared with?' },
    form.sharing.map((choice) => h('label', { class: 'radio-row' },
      h('input', { type: 'radio', name: group, value: choice, checked: choice === sharing, onchange: () => { sharing = choice; } }),
      h('span', null, choice))));
  const answers = (request) => ({ name: shareName(store), request, died, sharing });

  const body = h('div', { class: 'share-body', hidden: !on },
    h('p', { class: 'hint share-from' }, `From ${shareName(store)}, with the request as you wrote it${fixed ? '' : ' above'}. Details stay private.`),
    preview && h('blockquote', { class: 'share-preview' }, preview),
    field('Is this a prayer request for someone who has died?', chipGroup({
      label: 'Is this a prayer request for someone who has died?',
      value: 'no',
      options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }],
      onChange: (v) => { died = v === 'yes'; },
    })),
    field('Who would you like your prayer request shared with?', choices),
    h('p', { class: 'hint' }, 'Trinity prays for a request for one month. For an ongoing one, share it again each month: tap it, then Share with Trinity again.'),
    fixed && preview && h('a', {
      class: 'link-btn share-open',
      href: form.view,
      target: '_blank',
      rel: 'noopener',
      onclick: (e) => { e.currentTarget.href = prefilledUrl(form, answers(preview)); },
    }, icon('link'), 'Or open the form itself, filled in'));

  let onToggle = null;
  const toggleRow = !fixed && toggle({
    label: 'Share with Trinity',
    hint: 'Also send this request to Trinity’s prayer list.',
    checked: false,
    onChange: (v) => {
      on = v;
      body.hidden = !v;
      onToggle?.(v);
    },
  });

  return {
    el: h('div', { class: 'share' }, toggleRow, body),
    get on() { return on; },
    set onToggle(fn) { onToggle = fn; },
    /** The form's answers for one request. */
    answers,
    /** Remember the sharing choice for next time. */
    remember() {
      const prev = store.state.settings.share?.[form.id] || {};
      if (prev.sharing !== sharing) store.setSetting('share', { ...(store.state.settings.share || {}), [form.id]: { ...prev, sharing } });
    },
  };
}

/** Send what's waiting once the Undo moment has passed, and say how it went. */
function sendSharesSoon(app) {
  setTimeout(async () => {
    const { sent, waiting } = await flushOutbox(app.store);
    if (sent) toast(sent === 1 ? 'Sent to Trinity’s prayer list' : `Sent ${sent} requests to Trinity’s prayer list`);
    else if (waiting) toast('No connection yet. It will go to Trinity when you’re back online.');
  }, app.shareDelay ?? 5500);
}

/** Share an entry already on a list with Trinity (again, for an ongoing request). */
export function openShareSheet(app, itemId) {
  const { store } = app;
  const found = store.findItem(itemId);
  if (!found) return null;
  const { item } = found;
  const share = shareFields(app, { fixed: true, preview: item.text });
  const last = item.shared?.[TRINITY_FORM.id];
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, last ? 'Send to Trinity again' : 'Send to Trinity');
  const form = h('form', { class: 'share-form', novalidate: true },
    h('p', { class: 'sheet-text' }, last
      ? `Shared with Trinity on ${formatWithYear(last)}. Trinity prays for a request for a month, so send it again to keep it on their list.`
      : 'Sends this request to Trinity’s prayer list through the parish’s prayer request form.'),
    share.el,
    h('div', { class: 'sheet-actions' }, submit));
  let sheet;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    share.remember();
    const job = queueShare(store, { itemIds: [item.id], answers: share.answers(item.text) });
    sheet.close();
    toast('Sending to Trinity in a moment', { action: 'Undo', onAction: () => cancelShare(store, job) });
    sendSharesSoon(app);
  });
  sheet = openSheet({ title: 'Share with Trinity', className: 'sheet-share', content: form });
  return sheet;
}

/**
 * The main "add" sheet. Opens on the last list used, with that list's last
 * duration. Several lines add several entries.
 */
export function openAddSheet(app, { text = '', listId = null, date = null, day: presetDay = null } = {}) {
  const { store } = app;
  // Cycles (like the Anglican Cycle) come in whole; you add to the other lists.
  const lists = store.state.lists.filter((l) => l.type !== 'cycle');
  if (!lists.length) {
    toast('Make a list first (Lists → New list).');
    return null;
  }
  const meta = store.state.meta;
  const start = date || app.viewDate;
  const pick = (id) => lists.find((l) => l.id === id);
  let list = pick(listId) || pick(meta.quickAddList) || lists.find((l) => l.type === 'daily') || lists[0];
  let duration = meta.durations?.[list.id] || 'ongoing';
  let until = addDays(start, 6);
  let day = null;
  let dayTouched = false;
  let monthDay = suggestMonthDay(list, start);
  let dateValue = start;
  if (presetDay != null && list.type === 'weekly') { day = presetDay; dayTouched = true; }
  if (presetDay != null && list.type === 'monthly') monthDay = presetDay;

  const textarea = h('textarea', {
    class: 'input input-lg add-text',
    rows: 1,
    placeholder: 'Name or prayer request',
    'aria-label': 'Name or prayer request',
    enterkeyhint: 'done',
    autocapitalize: 'sentences',
    value: text,
  });
  const note = h('textarea', { class: 'input', rows: 2, placeholder: 'Details (optional)', 'aria-label': 'Details' });
  const noteField = h('div', { class: 'field', hidden: true }, note);
  const noteBtn = h('button', {
    type: 'button',
    class: 'link-btn',
    onclick: () => { noteField.hidden = false; noteBtn.hidden = true; note.focus(); },
  }, '+ Add details');
  const multiHint = h('p', { class: 'hint multi-hint', hidden: true });
  const schedule = h('div', { class: 'schedule' });
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Add');
  const share = shareFields(app);
  share.el.hidden = !canShare(list);
  share.onToggle = () => refresh();

  const entries = () => {
    const raw = textarea.value;
    if (!raw.trim()) return [];
    return raw.trim().includes('\n') ? parseList(raw) : [{ text: raw.trim() }];
  };

  const refresh = () => {
    const n = entries().length;
    submit.disabled = n === 0;
    submit.textContent = `${n > 1 ? `Add ${n}` : 'Add'}${share.on && canShare(list) ? ' and share' : ''}`;
    multiHint.hidden = n < 2;
    multiHint.textContent = `${n} lines will be added as ${n} separate entries.`;
    if (list.type === 'weekly' && !dayTouched) {
      const suggested = suggestWeekday(list, textarea.value, start);
      if (suggested !== day) { day = suggested; renderSchedule(); }
    }
  };

  function renderSchedule() {
    const parts = [];
    if (list.type === 'daily') {
      const untilInput = dateInput(until, (v) => { until = v; }, 'Pray until');
      untilInput.min = start;
      const untilField = h('div', { class: 'until-row', hidden: duration !== 'until' }, h('span', null, 'Until'), untilInput);
      parts.push(field('How long',
        chipGroup({
          label: 'How long',
          wrap: true,
          value: duration,
          options: DURATIONS.map((d) => ({
            value: d.id,
            label: d.id === 'day' && start !== app.today ? 'That day only' : d.label,
          })),
          onChange: (v) => { duration = v; untilField.hidden = v !== 'until'; },
        }),
        untilField));
    } else if (list.type === 'weekly') {
      if (day == null) day = suggestWeekday(list, textarea.value, start);
      parts.push(field(list.morningPrayer ? 'Morning Prayer day' : 'Day of the week', weekdayPicker(list, day, (v) => { day = v; dayTouched = true; }),
        list.morningPrayer && h('p', { class: 'hint' }, list.everyDay
          ? 'On that day’s Morning Prayer list, and in your own prayer every day.'
          : 'On that day’s Morning Prayer list.')));
    } else if (list.type === 'monthly') {
      parts.push(field('Day of the month', monthDayPicker(list, monthDay, (v) => { monthDay = v; })));
    } else if (list.type === 'dated') {
      parts.push(field('Date', dateInput(dateValue, (v) => { dateValue = v; })));
    }
    schedule.replaceChildren(...parts);
  }

  const listPicker = chipGroup({
    label: 'List',
    className: 'chips-lists',
    value: list.id,
    options: [...lists]
      .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type))
      .map((l) => ({ value: l.id, label: l.name })),
    onChange: (id) => {
      list = store.list(id);
      duration = store.state.meta.durations?.[id] || 'ongoing';
      day = null;
      dayTouched = false;
      monthDay = suggestMonthDay(list, start);
      share.el.hidden = !canShare(list);
      renderSchedule();
      refresh();
    },
  });

  textarea.addEventListener('input', refresh);
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      form.requestSubmit ? form.requestSubmit() : submit.click();
    }
  });

  const form = h('form', { class: 'add-form', novalidate: true },
    textarea, multiHint,
    field('List', listPicker),
    schedule,
    noteBtn, noteField,
    share.el,
    h('div', { class: 'sheet-actions' }, submit));

  let sheet;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const es = entries();
    if (!es.length) { textarea.focus(); return; }
    const sharing = share.on && canShare(list);
    const noteText = note.value.trim();
    let fields = {};
    if (list.type === 'daily') fields = { start, end: endDateFor(duration, start, until) };
    if (list.type === 'weekly') fields = { day };
    if (list.type === 'monthly') fields = { day: monthDay };
    if (list.type === 'dated') fields = { date: dateValue };
    const added = store.addItems(list.id, es.map((en) => ({ ...en, ...fields, note: es.length === 1 ? noteText : '' })));
    store.commit((s) => {
      s.meta.quickAddList = list.id;
      if (list.type === 'daily') s.meta.durations = { ...s.meta.durations, [list.id]: duration };
    }, { silent: true });
    // Each request goes to Trinity as its own response, worded as you wrote it.
    const jobs = [];
    if (sharing && added.length) {
      share.remember();
      for (const i of added) jobs.push(queueShare(store, { itemIds: [i.id], answers: share.answers(i.text) }));
    }
    requestPersistentStorage();
    sheet.close();
    const where = describeSchedule(list, added[0]);
    const what = added.length === 1 ? `Added “${short(added[0].text, 32)}” to ${list.name}${where}` : `Added ${added.length} to ${list.name}${where}`;
    toast(jobs.length ? `${what}. Sharing with Trinity…` : what, {
      action: 'Undo',
      onAction: () => {
        for (const job of jobs) cancelShare(store, job);
        for (const i of added) store.deleteItem(i.id);
      },
    });
    if (jobs.length) sendSharesSoon(app);
  });

  renderSchedule();
  refresh();
  sheet = openSheet({ title: 'Add to your prayers', className: 'sheet-add', content: form });
  listPicker.querySelector('.chip.on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  autoGrow(textarea, 160);
  textarea.focus();
  if (text) textarea.setSelectionRange(text.length, text.length);
  return sheet;
}

function describeSchedule(list, item) {
  if (!item) return '';
  if (list.type === 'weekly') return ` (${WEEKDAYS[item.day]}s)`;
  if (list.type === 'monthly') return ` (day ${item.day})`;
  if (list.type === 'dated') return ` (${formatShort(item.date)})`;
  if (item.end) return item.end === item.start ? ' for the day' : ` until ${formatShort(item.end)}`;
  return '';
}

// ---------- edit an item ----------

export function openItemSheet(app, itemId, { list: inList = null, entry = null } = {}) {
  const { store } = app;
  if (entry?.builtin) return openEntrySheet(app, inList, entry);
  const found = store.findItem(itemId);
  if (!found) return null;
  const { list, item } = found;
  if (list.type === 'cycle') return openEntrySheet(app, list, item);
  let target = list;
  let day = item.day;
  let date = item.date || app.viewDate;
  let end = item.end || null;

  const text = h('input', { class: 'input input-lg', value: item.text, 'aria-label': 'Name or prayer request', enterkeyhint: 'done' });
  const note = h('textarea', { class: 'input', rows: 2, placeholder: 'Details (optional)', 'aria-label': 'Details', value: item.note || '' });
  const schedule = h('div', { class: 'schedule' });

  const endPresets = [
    { value: 'ongoing', label: 'Ongoing' },
    { value: '1w', label: '1 week' },
    { value: '1m', label: '1 month' },
    { value: 'date', label: 'Pick a date' },
  ];

  function renderSchedule() {
    const parts = [];
    if (target.type === 'weekly') {
      if (!(day >= 0 && day <= 6)) day = suggestWeekday(target, text.value, app.viewDate);
      parts.push(field(target.morningPrayer ? 'Morning Prayer day' : 'Day of the week', weekdayPicker(target, day, (v) => { day = v; })));
    } else if (target.type === 'monthly') {
      if (!(day >= 1 && day <= 31)) day = suggestMonthDay(target, app.viewDate);
      parts.push(field('Day of the month', monthDayPicker(target, day, (v) => { day = v; })));
    } else if (target.type === 'dated') {
      parts.push(field('Date', dateInput(date, (v) => { date = v; })));
    }
    if (target.type !== 'dated') {
      // Durations count from today, or from the first day if that is still ahead.
      const from = item.start && item.start > app.today ? item.start : app.today;
      const endInput = dateInput(end || addDays(from, 6), (v) => { end = v; }, 'Last day');
      const endRow = h('div', { class: 'until-row', hidden: !end }, h('span', null, 'Last day'), endInput);
      parts.push(field('How long',
        chipGroup({
          label: 'How long',
          wrap: true,
          value: end ? 'date' : 'ongoing',
          options: endPresets,
          onChange: (v) => {
            if (v === 'ongoing') end = null;
            else if (v === 'date') end = end || addDays(from, 6);
            else end = endDateFor(v, from);
            endInput.value = end || '';
            endRow.hidden = !end;
          },
        }),
        endRow));
    }
    schedule.replaceChildren(...parts);
  }

  const listSelect = h('select', {
    class: 'input',
    'aria-label': 'List',
    onchange: (e) => {
      const next = store.list(e.target.value);
      if (next.type !== target.type) day = null;
      target = next;
      renderSchedule();
    },
  }, store.state.lists.filter((l) => l.type !== 'cycle').map((l) => h('option', { value: l.id, selected: l.id === list.id }, l.name)));

  const details = [];
  if (item.created) details.push(`Added ${formatWithYear(todayKey(new Date(item.created)))}`);
  if (item.start && list.type === 'daily') details.push(`first day ${formatMedium(item.start)}`);
  const sharedOn = item.shared?.[TRINITY_FORM.id];
  if (sharedOn) details.push(`shared with Trinity ${formatMedium(sharedOn)}`);
  const shareBtn = canShare(list) && h('button', {
    class: 'link-btn',
    type: 'button',
    onclick: () => { sheet.close(); openShareSheet(app, item.id); },
  }, icon('upload'), sharedOn ? 'Share with Trinity again' : 'Share with Trinity');

  const save = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save');
  const del = h('button', { class: 'btn btn-danger', type: 'button' }, icon('trash'), 'Delete');

  const form = h('form', { class: 'item-form', novalidate: true },
    field('Name or request', text),
    field('Details', note),
    field('List', listSelect),
    schedule,
    details.length && h('p', { class: 'hint' }, details.join(' · ')),
    shareBtn,
    h('div', { class: 'sheet-actions sheet-actions-split' }, del, save));

  let sheet;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = text.value.trim();
    if (!value) { text.focus(); return; }
    const fields = { text: value, note: note.value.trim() || null, end: target.type === 'dated' ? null : end };
    if (target.type === 'weekly' || target.type === 'monthly') fields.day = day;
    if (target.type === 'dated') fields.date = date;
    if (target.id !== list.id) {
      store.moveItem(item.id, target.id, fields);
      toast(`Moved to ${target.name}`);
    } else {
      store.updateItem(item.id, fields);
    }
    sheet.close();
  });
  del.addEventListener('click', () => {
    const removed = store.deleteItem(item.id);
    sheet.close();
    toast(`Deleted “${short(item.text, 32)}”`, { action: 'Undo', onAction: () => store.restoreItem(removed) });
  });

  renderSchedule();
  sheet = openSheet({ title: 'Edit', className: 'sheet-item', content: form });
  return sheet;
}

/**
 * Edit one day's entry in a cycle. A built-in entry (the Anglican Cycle) keeps
 * the original underneath your edit, so it can be restored.
 */
function openEntrySheet(app, list, entry) {
  const { store } = app;
  const builtin = !!entry.builtin;
  const text = h('input', { class: 'input input-lg', value: entry.text, 'aria-label': 'Entry', enterkeyhint: 'done' });
  const note = h('textarea', { class: 'input', rows: 3, placeholder: 'Details (optional)', 'aria-label': 'Details', value: entry.note || '' });
  const save = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save');
  const remove = h('button', { class: 'btn btn-danger', type: 'button' }, icon('trash'), builtin ? 'Hide' : 'Delete');
  const restore = builtin && entry.edited ? h('button', { class: 'link-btn', type: 'button' }, 'Restore the original wording') : null;
  const form = h('form', { class: 'item-form', novalidate: true },
    builtin && h('p', { class: 'sheet-text' }, `From ${list.name}. If a diocese has merged or been renamed, change it here; this day will show your wording from now on.`),
    field('Entry', text),
    field('Details', note),
    restore,
    h('div', { class: 'sheet-actions sheet-actions-split' }, remove, save));
  let sheet;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = text.value.trim();
    if (!value) { text.focus(); return; }
    if (builtin) store.overrideEntry(list.id, entry.id, { text: value, note: note.value.trim() || null });
    else store.updateItem(entry.id, { text: value, note: note.value.trim() || null });
    sheet.close();
  });
  remove.addEventListener('click', () => {
    sheet.close();
    if (builtin) {
      store.overrideEntry(list.id, entry.id, { hidden: true });
      toast('Hidden from the cycle', { action: 'Undo', onAction: () => store.overrideEntry(list.id, entry.id, null) });
    } else {
      const removed = store.deleteItem(entry.id);
      toast(`Deleted “${short(entry.text, 32)}”`, { action: 'Undo', onAction: () => store.restoreItem(removed) });
    }
  });
  restore?.addEventListener('click', () => {
    store.overrideEntry(list.id, entry.id, null);
    sheet.close();
    toast('Original wording restored');
  });
  sheet = openSheet({ title: 'Edit entry', className: 'sheet-item', content: form });
  return sheet;
}

// ---------- paste a list ----------

const IMPORT_HELP = {
  daily: 'One per line. Bullets and numbers are removed.',
  weekly: 'One name per line, as First Last or Last, First. To set the days, put a day name on its own line (Sunday, Monday…) above that day’s names. A spreadsheet (CSV) with First Name and Last Name columns works too; a Preferred Name column is used where it’s filled in.',
  monthly: 'One church per line. Start a line with its day number (“2 St Paul’s, Anytown”); lines without a number belong to the day above. With no numbers, line 1 is day 1, line 2 is day 2, and so on.',
  dated: 'Each day’s entry should start with its date, such as “Monday 2 November 2026”, “Nov 2, 2026” or “2026-11-02”. The lines after a date, up to the next date, are that day’s entry. A calendar laid out by month works too, like the diocese’s Daily Cycle of Prayer PDF: a month name on its own line, then each day’s number and name (“3 Scott Seefeldt, Rector, Zion, Oconomowoc”).',
  cycle: 'Each day’s entry should start with its date, such as “Monday 2 November 2026”, “02-Nov-2026” or “2026-11-02”; the lines after it, up to the next date, are that day’s entry. After the last date the cycle starts over.',
};

const IMPORT_EXAMPLE = {
  daily: 'Mom\nDad\nAunt Sue',
  weekly: 'Sunday\nMary Adams\nJohn & Sue Baker\nMonday\nSmith, Tom',
  monthly: '1 The Bishop and diocesan staff\n2 St Paul’s, Anytown\n3 Christ Church, Riverside',
  dated: 'Monday 2 November 2026\nThe Diocese of …\nThe Rt Revd …\nTuesday 3 November 2026\n…',
  cycle: 'Monday 2 November 2026\nThe Diocese of …\nThe Rt Revd …\nTuesday 3 November 2026\n…',
};

export function openImportSheet(app, listId) {
  const { store } = app;
  const list = store.list(listId);
  if (!list) return null;
  const isAcp = list.kind === 'acp';
  const isCycle = list.type === 'cycle';
  const hasBuiltin = isCycle && !!bundleFor(list);
  const nonEmpty = list.items.length > 0;
  let mode = nonEmpty && (list.type === 'monthly' || list.type === 'dated') ? 'replace' : 'add';
  if (nonEmpty && list.type === 'dated') mode = 'merge';
  if (isCycle) mode = 'cycle';
  let looseDay = list.type === 'weekly' ? (nonEmpty ? suggestWeekday(list, '', app.viewDate) : 'spread') : null;
  let spreadDays = spreadDaysFor(list);
  let parsed = { entries: [] };

  const textarea = h('textarea', {
    class: 'input import-text',
    rows: 8,
    placeholder: IMPORT_EXAMPLE[list.type],
    'aria-label': 'Paste here',
    spellcheck: 'false',
  });
  const preview = h('div', { class: 'preview', 'aria-live': 'polite' });
  const looseField = h('div', { class: 'loose-day' });
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit', disabled: true }, 'Add');

  const fileInput = h('input', {
    type: 'file',
    accept: '.pdf,.txt,.csv,.tsv,.json,application/pdf,text/plain,text/csv,application/json',
    class: 'visually-hidden',
    onchange: async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      if (!isPdf(file)) {
        textarea.value = await file.text();
        update();
        return;
      }
      status.hidden = false;
      status.textContent = `Reading ${file.name}…`;
      submit.disabled = true;
      try {
        textarea.value = await pdfToText(file, (page, pages) => { status.textContent = `Reading page ${page} of ${pages}…`; });
        status.hidden = true;
      } catch (err) {
        console.error(err);
        status.textContent = 'That PDF couldn’t be read. Try copying its text and pasting it instead.';
      }
      update();
    },
  });
  const status = h('p', { class: 'hint import-status', hidden: true, 'aria-live': 'polite' });

  function parse() {
    const raw = textarea.value;
    if (!raw.trim()) return { entries: [] };
    if (list.type === 'weekly') return parseWeekly(raw);
    if (list.type === 'monthly') return parseMonthly(raw);
    if (list.type === 'dated' || isCycle) return parseDated(raw, { defaultYear: parseKey(app.today).y });
    return { entries: parseList(raw) };
  }

  function update() {
    parsed = parse();
    const n = parsed.entries.length;
    submit.disabled = n === 0;
    submit.textContent = n === 0 ? 'Add' : isCycle ? `Use these ${plural(cycleDays(), 'day')}` : mode === 'replace' ? `Replace with ${n}` : `Add ${n}`;
    renderLoose();
    renderPreview();
  }

  const cycleDays = () => (parsed.first ? diffDays(parsed.first, parsed.last) + 1 : 0);

  function renderLoose() {
    if (list.type !== 'weekly') return;
    const loose = parsed.entries.filter((e) => e.day == null).length;
    if (!loose) { replace(looseField); return; }
    const options = WEEKDAYS_SHORT.map((d, i) => ({ value: i, label: d }));
    if (!parsed.sawHeader) options.unshift({ value: 'spread', label: 'Spread A–Z' });
    if (looseDay === 'spread' && parsed.sawHeader) looseDay = 0;
    replace(looseField, field(
      parsed.sawHeader ? `${plural(loose, 'name')} before the first day name go on` : 'Which day?',
      chipGroup({ label: 'Day for these names', wrap: true, value: looseDay, options, onChange: (v) => { looseDay = v; renderLoose(); renderPreview(); } }),
      looseDay === 'spread' && h('p', { class: 'hint' }, nonEmpty
        ? 'Everyone on the list, old and new, is put in last-name order and divided evenly over these days, keeping families together:'
        : 'Names are put in last-name order and divided evenly over these days, keeping families together:'),
      looseDay === 'spread' && dayChips(spreadDays, (days) => { spreadDays = days; renderPreview(); }),
    ));
  }

  function renderPreview() {
    const es = parsed.entries;
    if (!textarea.value.trim()) { replace(preview); return; }
    if (!es.length) {
      replace(preview, h('p', { class: 'preview-empty' }, list.type === 'dated' || isCycle
        ? 'No dates found yet. Each day’s entry needs to start with a date.'
        : 'Nothing found yet.'));
      return;
    }
    let summary;
    if (list.type === 'dated') summary = `${plural(es.length, 'date')} from ${formatWithYear(parsed.first)} to ${formatWithYear(parsed.last)}`;
    else if (isCycle) summary = `${plural(cycleDays(), 'day')}, ${formatWithYear(parsed.first)} to ${formatWithYear(parsed.last)}, then it starts over`;
    else if (list.type === 'monthly') summary = `${plural(es.length, 'entry', 'entries')} on ${plural(new Set(es.map((e) => e.day)).size, 'day')} of the month`;
    else if (list.type === 'weekly') {
      const dayCount = new Set(es.map((e) => e.day).filter((d) => d != null)).size;
      summary = `${plural(es.length, 'name')}${dayCount ? ` over ${plural(dayCount, 'day')}` : ''}`;
    } else summary = plural(es.length, 'entry', 'entries');
    const warn = parsed.overflow ? h('p', { class: 'hint' }, `${plural(parsed.overflow, 'line')} skipped (titles before day 1, or past day 31).`) : null;
    if (list.type === 'weekly' && looseDay === 'spread' && es.some((e) => e.day == null)) {
      const everyone = [...list.items, ...es.map((e, k) => ({ id: `new${k}`, ...e }))];
      replace(preview,
        h('p', { class: 'preview-summary' }, icon('check'), `${summary}, spread over ${plural(spreadDays.length, 'day')}`),
        h('ol', { class: 'spread-preview' }, spreadPreview(planSpread(everyone, spreadDays))));
      return;
    }
    const rows = es.slice(0, 6).map((e) => h('li', null,
      h('span', { class: 'preview-key' }, previewKey(e)),
      h('span', { class: 'preview-text' }, list.sort === 'last' ? parseName(e.text).display : e.text,
        e.note && h('span', { class: 'preview-note' }, e.note.split('\n')[0]))));
    replace(preview,
      h('p', { class: 'preview-summary' }, icon('check'), summary),
      h('ul', { class: 'preview-list' }, rows),
      es.length > 6 && h('p', { class: 'hint' }, `…and ${es.length - 6} more`),
      warn);
  }

  function previewKey(e) {
    if (list.type === 'dated' || isCycle) return formatMedium(e.date);
    if (list.type === 'monthly') return `Day ${e.day}`;
    if (list.type === 'weekly') {
      const d = e.day ?? looseDay;
      return d === 'spread' ? 'A–Z' : WEEKDAYS_SHORT[d];
    }
    return '•';
  }

  const modeOptions = list.type === 'dated'
    ? [{ value: 'merge', label: 'Add, replacing those dates' }, { value: 'replace', label: 'Replace everything' }]
    : [{ value: 'add', label: 'Add to the list' }, { value: 'replace', label: 'Replace the list' }];

  const form = h('form', { class: 'import-form', novalidate: true },
    h('p', { class: 'sheet-text' }, IMPORT_HELP[list.type]),
    isAcp && h('p', { class: 'sheet-text' },
      hasBuiltin
        ? 'The current cycle is built in. When a new one is published, download its PDF from '
        : 'Download the cycle’s PDF from ',
      h('a', { href: ACP_URL, target: '_blank', rel: 'noopener' }, 'anglicancommunion.org'),
      ' and choose it below, or copy its text and paste it here.',
      hasBuiltin ? ' It takes the place of the built-in cycle; you can switch back in the list’s settings.' : ''),
    textarea,
    h('div', { class: 'import-tools' },
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => pasteFromClipboard() }, icon('paste'), 'Paste'),
      h('button', { type: 'button', class: 'btn btn-sm', onclick: () => fileInput.click() }, icon('file'), 'Choose a file (PDF or text)'),
      fileInput),
    status,
    looseField,
    nonEmpty && !isCycle && field('This list already has entries',
      chipGroup({ label: 'Add or replace', wrap: true, value: mode, options: modeOptions, onChange: (v) => { mode = v; update(); } })),
    preview,
    h('div', { class: 'sheet-actions' }, submit));

  async function pasteFromClipboard() {
    try {
      const t = await navigator.clipboard.readText();
      if (t) { textarea.value = t; update(); }
    } catch {
      textarea.focus();
      toast('Long-press in the box and choose Paste.');
    }
  }

  textarea.addEventListener('input', debounce(update, 120));

  let sheet;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const es = parsed.entries;
    if (!es.length) return;
    const snap = store.snapshot();
    let entries = es;
    if (list.type === 'weekly') {
      entries = es.map((en) => ({ ...en, day: en.day ?? (looseDay === 'spread' ? 0 : looseDay) }));
    }
    if (isCycle) {
      const start = parsed.first;
      store.replaceCycle(list.id, { start, entries: entries.map((en) => ({ ...en, seq: diffDays(start, en.date) })) });
    } else if (mode === 'replace') {
      store.replaceItems(list.id, entries);
    } else if (mode === 'merge') {
      const dates = new Set(entries.map((en) => en.date));
      store.commit((s) => {
        const l = s.lists.find((x) => x.id === list.id);
        const t = store.stamp();
        l.items = l.items.filter((i) => {
          if (dates.has(i.date)) { s.tombstones[i.id] = t; return false; }
          return true;
        });
      }, { silent: true });
      store.addItems(list.id, entries);
    } else {
      store.addItems(list.id, entries);
    }
    if (list.type === 'weekly' && looseDay === 'spread' && es.some((en) => en.day == null)) store.distributeWeekly(list.id, spreadDays);
    if (list.hidden) store.updateList(list.id, { hidden: false });
    requestPersistentStorage();
    sheet.close();
    const what = isCycle ? `Now using ${plural(cycleDays(), 'day')} from ${formatWithYear(parsed.first)}`
      : `${mode === 'replace' ? 'Replaced with' : 'Added'} ${plural(es.length, list.type === 'dated' ? 'date' : 'entry', list.type === 'dated' ? 'dates' : 'entries')}`;
    toast(what, {
      action: 'Undo',
      onAction: () => store.restore(snap),
    });
  });

  update();
  sheet = openSheet({ title: isCycle ? (hasBuiltin ? 'Load a newer cycle' : 'Add the cycle') : `Paste into ${list.name}`, className: 'sheet-import', content: form });
  return sheet;
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ---------- list settings ----------

export function openListSheet(app, listId = null) {
  const { store } = app;
  const existing = listId ? store.list(listId) : null;
  let type = existing?.type || 'daily';
  let sort = existing?.sort || 'added';
  let hidden = !!existing?.hidden;
  let morningPrayer = !!existing?.morningPrayer;
  let everyDay = !!existing?.everyDay;

  const name = h('input', { class: 'input input-lg', value: existing?.name || '', placeholder: 'e.g. Godchildren', 'aria-label': 'List name', enterkeyhint: 'done' });
  const typeField = existing ? null : field('Repeats',
    h('div', { class: 'type-cards', role: 'radiogroup', 'aria-label': 'Repeats' },
      Object.entries(LIST_TYPES).map(([value, t]) => {
        const btn = h('button', {
          type: 'button',
          class: `type-card ${value === type ? 'on' : ''}`,
          role: 'radio',
          'aria-checked': String(value === type),
          onclick: () => {
            type = value;
            for (const b of btn.parentElement.children) {
              b.classList.toggle('on', b === btn);
              b.setAttribute('aria-checked', String(b === btn));
            }
          },
        }, h('span', { class: 'type-name' }, t.label), h('span', { class: 'type-blurb' }, t.blurb));
        return btn;
      })));

  const save = h('button', { class: 'btn btn-primary', type: 'submit' }, existing ? 'Save' : 'Create list');
  const del = existing && h('button', { class: 'btn btn-danger', type: 'button' }, icon('trash'), 'Delete list');
  const prayer = existing ? prayerEditor(existing) : null;
  const builtinBack = existing?.type === 'cycle' && existing.items.length > 0 && bundleFor(existing)
    && h('button', {
      class: 'link-btn',
      type: 'button',
      onclick: () => {
        const snap = store.snapshot();
        store.replaceCycle(existing.id, { start: existing.start, entries: [] });
        sheet.close();
        toast('Back to the built-in cycle', { action: 'Undo', onAction: () => store.restore(snap) });
      },
    }, 'Switch back to the built-in cycle');
  const seeded = existing && seedFor(existing.id);
  const seedBack = seeded && existing.type === seeded.part.list.type && h('button', {
    class: 'link-btn',
    type: 'button',
    onclick: () => loadSeed(app, existing.id, { onDone: () => sheet.close() }),
  }, existing.items.length ? `Start again from ${seeded.part.label}` : `Fill it from ${seeded.part.label}`);

  const form = h('form', { class: 'list-form', novalidate: true },
    field('Name', name),
    typeField,
    (!existing || existing.type !== 'cycle') && field('Order', chipGroup({
      label: 'Order',
      wrap: true,
      value: sort,
      options: Object.entries(SORTS).map(([value, label]) => ({ value, label })),
      onChange: (v) => { sort = v; },
    })),
    existing && toggle({ label: 'Show on Today', checked: !hidden, onChange: (v) => { hidden = !v; } }),
    existing && toggle({
      label: 'Read at Morning Prayer',
      hint: existing.type === 'weekly'
        ? 'Each weekday’s names also come up on Today as one list to read aloud, marked once for the whole list. Names only; notes stay private.'
        : 'The day’s entries also come up on Today as one list to read aloud, marked once for the whole list. Names only; notes stay private.',
      checked: morningPrayer,
      onChange: (v) => { morningPrayer = v; },
    }),
    existing?.type === 'weekly' && toggle({
      label: 'Everyone, every day, in my own prayer',
      hint: 'Everyone on the list comes up every day to pray for one by one, apart from Morning Prayer. Off: only that day’s names.',
      checked: everyDay,
      onChange: (v) => { everyDay = v; },
    }),
    prayer?.el,
    builtinBack,
    seedBack,
    h('div', { class: `sheet-actions ${existing ? 'sheet-actions-split' : ''}` }, del, save));

  let sheet;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = name.value.trim();
    if (!value) { name.focus(); return; }
    if (existing) {
      const patch = { name: value, sort, hidden };
      if (morningPrayer !== !!existing.morningPrayer) patch.morningPrayer = morningPrayer;
      if (existing.type === 'weekly' && everyDay !== !!existing.everyDay) patch.everyDay = everyDay;
      if (prayer.changed()) patch.prayer = prayer.value();
      store.updateList(existing.id, patch);
      sheet.close();
    } else {
      const list = store.addList({ name: value, type, sort });
      sheet.close();
      app.navigate(`#/list/${list.id}`);
    }
  });
  del?.addEventListener('click', async () => {
    const n = existing.items.length;
    const ok = await confirmSheet({
      title: `Delete “${existing.name}”?`,
      message: n ? `This removes the list and its ${plural(n, 'entry', 'entries')}.` : 'This removes the empty list.',
      confirm: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const snap = store.snapshot();
    store.deleteList(existing.id);
    sheet.close();
    app.navigate('#/lists');
    toast(`Deleted ${existing.name}`, { action: 'Undo', onAction: () => store.restore(snap) });
  });

  sheet = openSheet({ title: existing ? 'List settings' : 'New list', className: 'sheet-list', content: form });
  if (!existing) name.focus();
  return sheet;
}

/**
 * The prayer that opens a list: any prayer from the Prayer Book, edited as
 * you like, your own words, or none. Returns { el, value(), changed() }.
 */
function prayerEditor(list) {
  const current = prayerFor(list);
  let choice = current ? (current.key && list.prayer?.text == null ? current.key : 'own') : 'none';
  const title = h('input', { class: 'input', value: current?.title || '', placeholder: 'Title, e.g. For our Bishop', 'aria-label': 'Prayer title' });
  const text = h('textarea', { class: 'input prayer-input', rows: 6, value: current?.text || '', 'aria-label': 'Prayer', placeholder: 'Write the prayer…' });
  const editRow = h('div', { class: 'prayer-edit', hidden: choice === 'none' }, title, text);
  const select = h('select', {
    class: 'input',
    'aria-label': 'Prayer',
    onchange: () => {
      choice = select.value;
      editRow.hidden = choice === 'none';
      if (PRAYERS[choice]) {
        title.value = PRAYERS[choice].title;
        text.value = PRAYERS[choice].text;
      } else if (choice === 'own') {
        text.focus();
      }
    },
  },
  h('option', { value: 'none', selected: choice === 'none' }, 'No prayer'),
  h('optgroup', { label: PRAYER_SOURCE },
    Object.entries(PRAYERS).map(([key, p]) => h('option', { value: key, selected: choice === key }, p.title))),
  h('option', { value: 'own', selected: choice === 'own' }, 'My own words'));
  const start = JSON.stringify(current);
  const value = () => {
    if (choice === 'none') return null;
    const base = PRAYERS[choice];
    // An unedited Prayer Book prayer is stored by name; anything edited is stored as written.
    if (base && title.value === base.title && text.value === base.text) return { key: choice };
    if (!text.value.trim()) return null;
    return { title: title.value.trim() || 'Prayer', text: text.value.trim(), key: base ? choice : null };
  };
  const el = field('Prayer',
    h('p', { class: 'hint field-hint' }, 'Said at the start of this list on Today and in pray-through. Choose one, then change its words if you like.'),
    select,
    editRow);
  return { el, value, changed: () => JSON.stringify(value() && prayerFor({ ...list, prayer: value() })) !== start };
}

// ---------- spread a weekly list ----------

export function openDistributeSheet(app, listId) {
  const { store } = app;
  const list = store.list(listId);
  if (!list) return null;
  let days = spreadDaysFor(list);
  const preview = h('ol', { class: 'spread-preview' });
  const renderPreview = () => replace(preview, spreadPreview(planSpread(list.items, days)));
  const chips = dayChips(days, (d) => { days = d; renderPreview(); });

  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, `Spread ${plural(list.items.length, 'name')}`);
  const form = h('form', { novalidate: true },
    h('p', { class: 'sheet-text' }, 'Puts everyone in last-name order and divides them evenly, so each day has its own stretch of the alphabet. People who share a last name stay on the same day.'),
    field('Use these days', chips),
    preview,
    h('div', { class: 'sheet-actions' }, submit));

  let sheet;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const snap = store.snapshot();
    store.distributeWeekly(list.id, days);
    sheet.close();
    toast(`Spread over ${plural(days.length, 'day')}`, { action: 'Undo', onAction: () => store.restore(snap) });
  });

  renderPreview();
  sheet = openSheet({ title: 'Spread over the week', className: 'sheet-spread', content: form });
  return sheet;
}
