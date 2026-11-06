// Works out which items from each list fall on a given date.
//
// List types:
//   daily   – every item, every day (each item may have a start/end date)
//   weekly  – item.day is the weekday, 0 = Sunday … 6 = Saturday. With
//             `everyDay`, everyone also comes up every day in your own
//             prayer, while each weekday's names stay a list of their own.
//   monthly – item.day is the day of the month, 1 … 31
//   dated   – item.date is one specific date
//   cycle   – one entry per day from a start date, starting over at the end
//             (the Anglican Cycle of Prayer, built in; see bundles.js)

import { weekday, parseKey, daysInMonth, diffDays, addDays, addMonths, todayKey, WEEKDAYS, formatShort } from './dates.js';
import { parseName, compareNames, compareText } from './names.js';
import { bundleFor } from './bundles.js';

export const LIST_TYPES = {
  daily: { label: 'Daily', blurb: 'Everyone on the list, every day' },
  weekly: { label: 'Weekly', blurb: 'A different set of names each day of the week' },
  monthly: { label: 'Monthly', blurb: 'A different entry for each day of the month' },
  dated: { label: 'By date', blurb: 'Entries for particular dates, such as anniversaries' },
  cycle: { label: 'Cycle', blurb: 'One entry a day, in order, starting over at the end, like the Anglican Cycle of Prayer' },
};

export const SORTS = {
  added: 'Order added',
  last: 'Last name',
  alpha: 'A to Z',
};

/** How long a new item stays on its list. */
export const DURATIONS = [
  { id: 'ongoing', label: 'Ongoing' },
  { id: 'day', label: 'Today only', days: 1 },
  { id: '3d', label: '3 days', days: 3 },
  { id: '1w', label: '1 week', days: 7 },
  { id: '2w', label: '2 weeks', days: 14 },
  { id: '1m', label: '1 month', months: 1 },
  { id: '3m', label: '3 months', months: 3 },
  { id: 'until', label: 'Until…' },
];

/** Last day an item starting on `start` is shown, or null for ongoing. */
export function endDateFor(durationId, start, untilDate = null) {
  const d = DURATIONS.find((x) => x.id === durationId);
  if (!d || d.id === 'ongoing') return null;
  if (d.id === 'until') return untilDate && untilDate >= start ? untilDate : null;
  if (d.days) return addDays(start, d.days - 1);
  return addDays(addMonths(start, d.months), -1);
}

export function isActive(item, dateKey) {
  if (item.start && dateKey < item.start) return false;
  if (item.end && dateKey > item.end) return false;
  return true;
}

/** Days of the month whose entries are prayed on dateKey. */
export function monthDaysFor(dateKey, foldShortMonths = true) {
  const { y, m, d } = parseKey(dateKey);
  const dim = daysInMonth(y, m);
  const days = [d];
  if (foldShortMonths && d === dim) for (let x = dim + 1; x <= 31; x++) days.push(x);
  return days;
}

export function nameOf(item) {
  if (item.last != null) return { first: item.first || '', last: item.last, display: item.text };
  return parseName(item.text);
}

export function sortItems(list, items) {
  const arr = [...items];
  if (list.sort === 'last') {
    arr.sort((a, b) => compareNames(nameOf(a), nameOf(b)));
  } else if (list.sort === 'alpha') {
    arr.sort((a, b) => compareText(a.text, b.text));
  } else if (list.type === 'monthly') {
    // Keep the order they were added, but a folded day (29–31) comes after the 28th's own entries.
    arr.sort((a, b) => (a.day ?? 0) - (b.day ?? 0));
  }
  return arr;
}

/** A cycle you have loaded into a list yourself (each entry with a `seq`, the day number from `start`), or null. */
export function ownCycle(list) {
  if (list.type !== 'cycle' || !list.items.length) return null;
  let length = 0;
  for (const i of list.items) length = Math.max(length, (i.seq ?? 0) + 1);
  return { start: list.start || list.since, length, builtin: false };
}

/**
 * Where a cycle list's days come from on dateKey: a cycle you have loaded, or
 * a built-in one such as the Anglican Cycle. One you load (a newer Anglican
 * Cycle, say) takes over from the built-in cycle on the day it begins, so it
 * can be loaded as soon as it is published; a newer built-in edition takes
 * over from it in turn on its own first day. With no date, your own cycle.
 */
export function cycleSource(list, dateKey = null) {
  if (list.type !== 'cycle') return null;
  const own = ownCycle(list);
  const bundle = bundleFor(list, dateKey);
  const built = bundle ? { start: bundle.start, length: bundle.entries.length, builtin: true, bundle } : null;
  if (!own || !built || !dateKey) return own || built;
  if (dateKey < own.start) return built;
  return built.start > own.start && dateKey >= built.start ? built : own;
}

/** The last day of a cycle source. */
export const cycleEnd = (src) => addDays(src.start, src.length - 1);

/**
 * For the Anglican Cycle: the last day of the cycle in use on dateKey, once
 * that day has passed and the cycle has started over (no newer one loaded or
 * built in yet), or null.
 */
export function cycleRanOut(list, dateKey) {
  if (list.type !== 'cycle' || list.kind !== 'acp') return null;
  const src = cycleSource(list, dateKey);
  return src && diffDays(src.start, dateKey) >= src.length ? cycleEnd(src) : null;
}

/** Day `index` of a cycle that began on `start` (wrapping in both directions). */
export function cycleIndex(start, length, dateKey) {
  const n = diffDays(start, dateKey);
  return ((n % length) + length) % length;
}

/** The built-in entries for one day of a cycle, with any of your edits applied. */
export function builtinEntries(list, bundle, index) {
  const day = bundle.entries[index];
  const parts = Array.isArray(day) ? day : [day];
  const out = [];
  parts.forEach((base, k) => {
    const id = parts.length > 1 ? `${bundle.id}:${index}.${k}` : `${bundle.id}:${index}`;
    const o = list.overrides?.[id];
    const edit = o && !o.reset ? o : null;
    if (edit?.hidden) return;
    out.push({
      id,
      seq: index,
      text: edit?.text ?? base.text,
      note: edit && 'note' in edit ? edit.note : base.note,
      builtin: true,
      edited: !!edit,
    });
  });
  return out;
}

/** How many entries a list has (for a cycle: how many days it runs). */
export function entryCount(list) {
  if (list.type === 'cycle') return cycleSource(list)?.length || 0;
  return list.items.length;
}

/** Items from one list that are due on dateKey, in display order. */
export function itemsDue(list, dateKey, { foldShortMonths = true } = {}) {
  let due;
  switch (list.type) {
    case 'daily':
      due = list.items.filter((i) => isActive(i, dateKey));
      break;
    case 'weekly': {
      if (list.everyDay) { due = list.items.filter((i) => isActive(i, dateKey)); break; }
      const wd = weekday(dateKey);
      due = list.items.filter((i) => i.day === wd && isActive(i, dateKey));
      break;
    }
    case 'monthly': {
      const days = new Set(monthDaysFor(dateKey, foldShortMonths));
      due = list.items.filter((i) => days.has(i.day) && isActive(i, dateKey));
      break;
    }
    case 'dated':
      due = list.items.filter((i) => i.date === dateKey);
      break;
    case 'cycle': {
      const src = cycleSource(list, dateKey);
      if (!src) { due = []; break; }
      const index = cycleIndex(src.start, src.length, dateKey);
      due = src.builtin ? builtinEntries(list, src.bundle, index) : list.items.filter((i) => (i.seq ?? 0) === index);
      break;
    }
    default:
      due = [];
  }
  return sortItems(list, due);
}

/** A short description of which slice of a list is shown on dateKey. */
export function cycleLabel(list, dateKey, { foldShortMonths = true } = {}) {
  switch (list.type) {
    case 'weekly':
      return list.everyDay ? 'Every day' : WEEKDAYS[weekday(dateKey)];
    case 'monthly': {
      const days = monthDaysFor(dateKey, foldShortMonths);
      return days.length > 1 ? `Days ${days[0]}–${days[days.length - 1]}` : `Day ${days[0]}`;
    }
    case 'dated':
      return formatShort(dateKey);
    case 'cycle':
      return '';
    default:
      return 'Daily';
  }
}

/** Range of dates covered by a dated list, or null. */
export function datedRange(list) {
  let first = null;
  let last = null;
  for (const i of list.items) {
    if (!i.date) continue;
    if (!first || i.date < first) first = i.date;
    if (!last || i.date > last) last = i.date;
  }
  return first ? { first, last } : null;
}

function itemSince(item) {
  if (item.since) return item.since;
  return item.created ? todayKey(new Date(item.created)) : null;
}

/**
 * Entries from earlier days that were not checked off, for lists that change
 * from day to day (not daily lists). An entry is only carried until it comes
 * round again, and never from before it was on the list.
 * @returns {Map<string, Array<{item, date}>>} by list id, oldest first
 */
export function carriedOver(state, today, isChecked, { lookback = 60 } = {}) {
  const opts = { foldShortMonths: state.settings?.foldShortMonths !== false };
  const out = new Map();
  for (const list of state.lists) {
    // Lists that bring everyone every day have nothing to carry.
    if (list.hidden || list.type === 'daily' || (list.type === 'weekly' && list.everyDay)) continue;
    const seen = new Set(itemsDue(list, today, opts).map((i) => i.id));
    const since = list.since || '0000-00-00';
    let carried = [];
    for (let k = 1; k <= lookback; k++) {
      const date = addDays(today, -k);
      if (date < since) break;
      const day = [];
      for (const item of itemsDue(list, date, opts)) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        const from = itemSince(item);
        if (from && date < from) continue;
        if (isChecked(date, item.id)) continue;
        day.push({ item, date });
      }
      // Older days first; each day keeps the list's own order.
      carried = [...day, ...carried];
    }
    if (carried.length) out.set(list.id, carried);
  }
  return out;
}

/**
 * Everything due on dateKey, grouped by list (in the lists' order).
 * Hidden lists are skipped. Each group: { list, items, carried, label, needsSetup, cycleEnded, ranOut }.
 */
export function agenda(state, dateKey, { carried = null } = {}) {
  const opts = { foldShortMonths: state.settings?.foldShortMonths !== false };
  const groups = [];
  for (const list of state.lists) {
    if (list.hidden) continue;
    const items = itemsDue(list, dateKey, opts);
    const group = {
      list,
      items,
      carried: carried?.get(list.id) || [],
      label: cycleLabel(list, dateKey, opts),
      needsSetup: false,
      cycleEnded: false,
      ranOut: cycleRanOut(list, dateKey),
    };
    if (entryCount(list) === 0 && list.type !== 'daily') group.needsSetup = true;
    if (list.type === 'dated' && items.length === 0 && list.items.length) {
      const range = datedRange(list);
      group.cycleEnded = !!range && dateKey > range.last;
    }
    groups.push(group);
  }
  return groups;
}

/** A weekly list's names for one weekday, whatever else the list brings that day. */
export function dayListFor(list, dateKey) {
  if (list.type !== 'weekly') return [];
  const wd = weekday(dateKey);
  return sortItems(list, list.items.filter((i) => i.day === wd && isActive(i, dateKey)));
}

/** The check that marks a list read at Morning Prayer, once for the whole list. */
export const officeId = (list) => `office:${list.id}`;

/**
 * Lists read at Morning Prayer on dateKey (list.morningPrayer): each one's
 * entries for the day, read out as a list and checked off once, apart from
 * praying for each entry in your own prayer. For a weekly list, the names of
 * that weekday. Lists with nothing that day are left out.
 */
export function officeFor(state, dateKey) {
  const opts = { foldShortMonths: state.settings?.foldShortMonths !== false };
  const out = [];
  for (const list of state.lists) {
    if (list.hidden || !list.morningPrayer) continue;
    const weekly = list.type === 'weekly';
    const items = weekly ? dayListFor(list, dateKey) : itemsDue(list, dateKey, opts);
    if (!items.length) continue;
    out.push({ list, items, id: officeId(list), label: weekly ? WEEKDAYS[weekday(dateKey)] : cycleLabel(list, dateKey, opts) });
  }
  return out;
}

/** Text for an item's end date relative to dateKey: "Last day", "Until Nov 9", or ''. */
export function endLabel(item, dateKey) {
  if (!item.end) return '';
  const left = diffDays(dateKey, item.end);
  if (left < 0) return `Ended ${formatShort(item.end)}`;
  if (left === 0) return 'Last day';
  if (left === 1) return 'Until tomorrow';
  return `Until ${formatShort(item.end)}`;
}

/**
 * Plan for spreading a weekly list over `days` in last-name order: each day
 * gets an even share of what is left, and people who share a last name stay
 * together. Returns [{ day, items }] in the order of `days`.
 */
export function planSpread(items, days = [0, 1, 2, 3, 4, 5, 6]) {
  const sorted = sortItems({ sort: 'last' }, items);
  const n = sorted.length;
  const lastOf = (i) => nameOf(sorted[i]).last.toLowerCase();
  const plan = [];
  let start = 0;
  for (let k = 0; k < days.length; k++) {
    let end = k === days.length - 1 ? n : start + Math.round((n - start) / (days.length - k));
    if (end > start && end < n && lastOf(end) === lastOf(end - 1)) {
      // The share ends inside a family: give the family to whichever day
      // leaves the share closer to even.
      let before = end;
      while (before > start && lastOf(before - 1) === lastOf(end)) before--;
      let after = end;
      while (after < n && lastOf(after) === lastOf(end - 1)) after++;
      end = before > start && end - before <= after - end ? before : after;
    }
    plan.push({ day: days[k], items: sorted.slice(start, end) });
    start = end;
  }
  return plan;
}

/** Splits a daily list's items into active / upcoming / ended relative to dateKey. */
export function partitionByStatus(items, dateKey) {
  const out = { active: [], upcoming: [], ended: [] };
  for (const i of items) {
    if (i.end && dateKey > i.end) out.ended.push(i);
    else if (i.start && dateKey < i.start) out.upcoming.push(i);
    else out.active.push(i);
  }
  return out;
}
