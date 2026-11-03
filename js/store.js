// App state and persistence. Everything lives in one JSON document in
// localStorage on this device; nothing is sent anywhere.

import { addDays, todayKey, isValidKey } from './dates.js';
import { parseName } from './names.js';
import { planSpread } from './schedule.js';

export const SCHEMA = 1;
export const STORAGE_KEY = 'prayer-tracker:data';
const CHECK_RETENTION_DAYS = 120;

export function uid() {
  const bytes = new Uint8Array(9);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

export function defaultState() {
  return {
    schema: SCHEMA,
    lists: [
      { id: 'anglican', name: 'Anglican Cycle of Prayer', type: 'dated', sort: 'added', kind: 'acp', items: [] },
      { id: 'diocese', name: 'Diocesan Cycle', type: 'monthly', sort: 'added', items: [] },
      { id: 'trinity', name: 'Trinity', type: 'weekly', sort: 'last', items: [] },
      { id: 'requests', name: 'Prayer Requests', type: 'daily', sort: 'added', items: [] },
      { id: 'family', name: 'Family', type: 'daily', sort: 'added', items: [] },
      { id: 'clergy', name: 'Clergy', type: 'daily', sort: 'last', items: [] },
    ],
    checks: {},
    settings: { seasonalColor: true, foldShortMonths: true, theme: 'auto' },
    meta: { created: Date.now(), lastBackup: null, quickAddList: 'requests', durations: {} },
  };
}

const LIST_TYPES = new Set(['daily', 'weekly', 'monthly', 'dated']);

/** Bring stored or imported data up to the current schema, filling gaps. */
export function migrate(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.lists)) throw new Error('Not Prayer Tracker data');
  const base = defaultState();
  const lists = data.lists
    .filter((l) => l && typeof l.id === 'string' && LIST_TYPES.has(l.type))
    .map((l) => ({
      ...l,
      name: String(l.name || 'Untitled list'),
      sort: ['added', 'last', 'alpha'].includes(l.sort) ? l.sort : 'added',
      items: (Array.isArray(l.items) ? l.items : [])
        .filter((i) => i && typeof i.text === 'string' && i.text.trim())
        .map((i) => ({ ...i, id: typeof i.id === 'string' ? i.id : uid() })),
    }));
  return {
    schema: SCHEMA,
    lists,
    checks: data.checks && typeof data.checks === 'object' ? data.checks : {},
    settings: { ...base.settings, ...(data.settings || {}) },
    meta: { ...base.meta, ...(data.meta || {}) },
  };
}

function safeLocalStorage() {
  try {
    const s = globalThis.localStorage;
    s.setItem('__pt_probe', '1');
    s.removeItem('__pt_probe');
    return s;
  } catch {
    return null;
  }
}

export class Store {
  constructor(storage = safeLocalStorage()) {
    this.storage = storage;
    this.persistent = !!storage;
    this.listeners = new Set();
    this.state = this.load();
    this.pruneChecks();
  }

  // ---------- persistence ----------

  load() {
    let raw = null;
    try {
      raw = this.storage?.getItem(STORAGE_KEY);
    } catch {
      raw = null;
    }
    if (!raw) return defaultState();
    try {
      return migrate(JSON.parse(raw));
    } catch {
      // Keep unreadable data aside rather than overwrite it.
      try { this.storage.setItem(`${STORAGE_KEY}:unreadable:${Date.now()}`, raw); } catch { /* ignore */ }
      return defaultState();
    }
  }

  save() {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      this.persistent = true;
    } catch (e) {
      this.persistent = false;
      this.lastError = e;
    }
  }

  /** Re-read from storage (another tab changed it). */
  reload() {
    this.state = this.load();
    this.emit();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    for (const fn of this.listeners) fn(this.state);
  }

  /** Apply a change, save it, and notify listeners (unless silent). */
  commit(mutator, { silent = false } = {}) {
    const result = mutator(this.state);
    this.save();
    if (!silent) this.emit();
    return result;
  }

  snapshot() {
    return JSON.stringify(this.state);
  }

  restore(snap) {
    this.commit((s) => {
      for (const k of Object.keys(s)) delete s[k];
      Object.assign(s, JSON.parse(snap));
    });
  }

  // ---------- lookups ----------

  list(id) {
    return this.state.lists.find((l) => l.id === id) || null;
  }

  findItem(itemId) {
    for (const list of this.state.lists) {
      const index = list.items.findIndex((i) => i.id === itemId);
      if (index >= 0) return { list, item: list.items[index], index };
    }
    return null;
  }

  // ---------- items ----------

  /**
   * Shape an entry for a list. People lists (sorted by last name) accept
   * "Last, First" and show it as "First Last".
   */
  normalizeEntry(list, entry) {
    const item = { id: uid(), text: String(entry.text).replace(/\s+/g, ' ').trim(), created: Date.now() };
    if (entry.note && String(entry.note).trim()) item.note = String(entry.note).trim();
    if (list.sort === 'last') {
      if (entry.last != null) {
        item.first = entry.first || '';
        item.last = entry.last;
      } else {
        const p = parseName(item.text);
        if (p.display !== item.text) {
          item.text = p.display;
          item.first = p.first;
          item.last = p.last;
        }
      }
    }
    const day = Number(entry.day);
    if (list.type === 'weekly') item.day = Number.isInteger(day) && day >= 0 && day <= 6 ? day : 0;
    if (list.type === 'monthly') item.day = Number.isInteger(day) && day >= 1 && day <= 31 ? day : 1;
    if (list.type === 'dated') item.date = isValidKey(entry.date) ? entry.date : todayKey();
    if (entry.start) item.start = entry.start;
    if (entry.end) item.end = entry.end;
    return item;
  }

  addItems(listId, entries) {
    return this.commit(() => {
      const list = this.list(listId);
      if (!list) return [];
      const added = entries
        .filter((e) => e && String(e.text || '').trim())
        .filter((e) => list.type !== 'dated' || isValidKey(e.date))
        .map((e) => this.normalizeEntry(list, e));
      list.items.push(...added);
      return added;
    });
  }

  replaceItems(listId, entries) {
    return this.commit(() => {
      const list = this.list(listId);
      if (!list) return [];
      list.items = [];
      const added = entries
        .filter((e) => e && String(e.text || '').trim())
        .filter((e) => list.type !== 'dated' || isValidKey(e.date))
        .map((e) => this.normalizeEntry(list, e));
      list.items.push(...added);
      return added;
    });
  }

  updateItem(itemId, patch) {
    return this.commit(() => {
      const found = this.findItem(itemId);
      if (!found) return null;
      const { item, list } = found;
      if (patch.text != null && patch.text !== item.text) {
        delete item.first;
        delete item.last;
        const shaped = this.normalizeEntry(list, { text: patch.text });
        item.text = shaped.text;
        if (shaped.last != null) {
          item.first = shaped.first;
          item.last = shaped.last;
        }
      }
      for (const key of ['note', 'day', 'date', 'start', 'end']) {
        if (!(key in patch)) continue;
        if (patch[key] == null || patch[key] === '') delete item[key];
        else item[key] = patch[key];
      }
      return item;
    });
  }

  /** Move an item to another list, setting whatever that list type needs. */
  moveItem(itemId, toListId, fields = {}) {
    return this.commit(() => {
      const found = this.findItem(itemId);
      const target = this.list(toListId);
      if (!found || !target) return null;
      found.list.items.splice(found.index, 1);
      const { id, created } = found.item;
      const base = { ...found.item, ...fields };
      if (fields.text != null && fields.text !== found.item.text) {
        // A renamed person gets their last name worked out again.
        delete base.first;
        delete base.last;
      }
      const item = { ...this.normalizeEntry(target, base), id, created };
      target.items.push(item);
      return item;
    });
  }

  deleteItem(itemId) {
    return this.commit(() => {
      const found = this.findItem(itemId);
      if (!found) return null;
      found.list.items.splice(found.index, 1);
      return { listId: found.list.id, index: found.index, item: found.item };
    });
  }

  /** Undo a deleteItem. */
  restoreItem({ listId, index, item }) {
    this.commit(() => {
      const list = this.list(listId);
      if (list) list.items.splice(Math.min(index, list.items.length), 0, item);
    });
  }

  removeEnded(listId, dateKey) {
    return this.commit(() => {
      const list = this.list(listId);
      if (!list) return 0;
      const before = list.items.length;
      list.items = list.items.filter((i) => !(i.end && i.end < dateKey));
      return before - list.items.length;
    });
  }

  /**
   * Spread a weekly list's names across the given weekdays in last-name order,
   * keeping people who share a last name on the same day.
   */
  distributeWeekly(listId, days = [0, 1, 2, 3, 4, 5, 6]) {
    return this.commit(() => {
      const list = this.list(listId);
      if (!list || !days.length) return;
      for (const { day, items } of planSpread(list.items, days)) for (const item of items) item.day = day;
    });
  }

  // ---------- check-offs ----------

  isChecked(dateKey, itemId) {
    return !!this.state.checks[dateKey]?.[itemId];
  }

  setChecked(dateKey, itemId, value, opts) {
    this.commit((s) => {
      if (value) {
        (s.checks[dateKey] ||= {})[itemId] = 1;
      } else if (s.checks[dateKey]) {
        delete s.checks[dateKey][itemId];
        if (!Object.keys(s.checks[dateKey]).length) delete s.checks[dateKey];
      }
    }, opts);
  }

  pruneChecks(today = todayKey()) {
    const cutoff = addDays(today, -CHECK_RETENTION_DAYS);
    let changed = false;
    for (const k of Object.keys(this.state.checks)) {
      if (k < cutoff) {
        delete this.state.checks[k];
        changed = true;
      }
    }
    if (changed) this.save();
  }

  // ---------- lists ----------

  addList({ name, type, sort = 'added' }) {
    return this.commit((s) => {
      const list = { id: uid(), name: name.trim() || 'New list', type, sort, items: [] };
      s.lists.push(list);
      return list;
    });
  }

  updateList(listId, patch) {
    return this.commit(() => {
      const list = this.list(listId);
      if (!list) return null;
      for (const key of ['name', 'sort', 'hidden']) if (key in patch) list[key] = patch[key];
      if (!list.hidden) delete list.hidden;
      return list;
    });
  }

  deleteList(listId) {
    return this.commit((s) => {
      const index = s.lists.findIndex((l) => l.id === listId);
      if (index < 0) return null;
      const [list] = s.lists.splice(index, 1);
      if (s.meta.quickAddList === listId) s.meta.quickAddList = s.lists.find((l) => l.type === 'daily')?.id || s.lists[0]?.id;
      return { list, index };
    });
  }

  moveList(listId, delta) {
    this.commit((s) => {
      const i = s.lists.findIndex((l) => l.id === listId);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= s.lists.length) return;
      [s.lists[i], s.lists[j]] = [s.lists[j], s.lists[i]];
    });
  }

  // ---------- settings ----------

  setSetting(key, value) {
    this.commit((s) => { s.settings[key] = value; });
  }

  setMeta(key, value) {
    this.commit((s) => { s.meta[key] = value; });
  }

  // ---------- backup ----------

  exportData() {
    return { app: 'prayer-tracker', schema: SCHEMA, exportedAt: new Date().toISOString(), data: this.state };
  }

  /** Replace everything with a backup file's contents. Throws if it isn't one. */
  importData(obj) {
    const data = obj && obj.app === 'prayer-tracker' ? obj.data : obj;
    const migrated = migrate(data);
    this.commit((s) => {
      for (const k of Object.keys(s)) delete s[k];
      Object.assign(s, migrated);
    });
  }

  eraseAll() {
    this.commit((s) => {
      for (const k of Object.keys(s)) delete s[k];
      Object.assign(s, defaultState());
    });
  }
}
