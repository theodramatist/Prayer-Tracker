// Works out which items from each list fall on a given date.
//
// List types:
//   daily   – every item, every day (each item may have a start/end date)
//   weekly  – item.day is the weekday, 0 = Sunday … 6 = Saturday
//   monthly – item.day is the day of the month, 1 … 31
//   dated   – item.date is one specific date (used for the Anglican Cycle of Prayer)

import { weekday, parseKey, daysInMonth, diffDays, addDays, addMonths, WEEKDAYS, formatShort } from './dates.js';
import { parseName, compareNames, compareText } from './names.js';

export const LIST_TYPES = {
  daily: { label: 'Daily', blurb: 'Everyone on the list, every day' },
  weekly: { label: 'Weekly', blurb: 'A different set of names each day of the week' },
  monthly: { label: 'Monthly', blurb: 'A different entry for each day of the month' },
  dated: { label: 'By date', blurb: 'One entry for each calendar date, like the Anglican Cycle of Prayer' },
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

/** Items from one list that are due on dateKey, in display order. */
export function itemsDue(list, dateKey, { foldShortMonths = true } = {}) {
  let due;
  switch (list.type) {
    case 'daily':
      due = list.items.filter((i) => isActive(i, dateKey));
      break;
    case 'weekly': {
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
    default:
      due = [];
  }
  return sortItems(list, due);
}

/** A short description of which slice of a list is shown on dateKey. */
export function cycleLabel(list, dateKey, { foldShortMonths = true } = {}) {
  switch (list.type) {
    case 'weekly':
      return WEEKDAYS[weekday(dateKey)];
    case 'monthly': {
      const days = monthDaysFor(dateKey, foldShortMonths);
      return days.length > 1 ? `Days ${days[0]}–${days[days.length - 1]}` : `Day ${days[0]}`;
    }
    case 'dated':
      return formatShort(dateKey);
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

/**
 * Everything due on dateKey, grouped by list (in the lists' order).
 * Hidden lists are skipped. Each group: { list, items, label, needsSetup, cycleEnded }.
 */
export function agenda(state, dateKey) {
  const opts = { foldShortMonths: state.settings?.foldShortMonths !== false };
  const groups = [];
  for (const list of state.lists) {
    if (list.hidden) continue;
    const items = itemsDue(list, dateKey, opts);
    const group = { list, items, label: cycleLabel(list, dateKey, opts), needsSetup: false, cycleEnded: false };
    if (list.items.length === 0 && list.type !== 'daily') group.needsSetup = true;
    if (list.type === 'dated' && items.length === 0 && list.items.length) {
      const range = datedRange(list);
      group.cycleEnded = !!range && dateKey > range.last;
    }
    groups.push(group);
  }
  return groups;
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
    while (end > start && end < n && lastOf(end) === lastOf(end - 1)) end++;
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
