// App state and persistence. Everything lives in one JSON document in
// localStorage on this device. If sync is turned on, the same document (minus
// device-only settings) is merged with a copy kept in your own GitHub repository.
//
// Every list and item carries an `updated` time, deletions leave a tombstone,
// and check-offs record when they happened (negative = un-checked), so two
// devices' copies can always be merged without losing anything (see sync.js).

import { addDays, todayKey, isValidKey } from './dates.js';
import { parseName } from './names.js';
import { planSpread } from './schedule.js';

export const SCHEMA = 2;
export const STORAGE_KEY = 'prayer-tracker:data';
const CHECK_RETENTION_DAYS = 120;
const TOMBSTONE_RETENTION_DAYS = 180;

export function uid() {
  const bytes = new Uint8Array(9);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

function seedItem(seed, entry, k, today) {
  const item = {
    id: `${SEED_PREFIX}${seed.id}-${entry.key}`,
    text: entry.text,
    created: seed.updated + k,
    updated: seed.updated,
    since: today,
  };
  if (entry.note) item.note = entry.note;
  if (entry.day != null) item.day = entry.day;
  if (entry.date) item.date = entry.date;
  return item;
}

export const LIST_TYPES = new Set(['daily', 'weekly', 'monthly', 'dated', 'cycle']);

/** Entries copied in from a built-in cycle (see seeds.js) have ids starting with this. */
export const SEED_PREFIX = 'seed-';
const DEFAULT_LIST_IDS = new Set(['anglican', 'diocese', 'diocese-daily', 'trinity', 'requests', 'family', 'clergy', 'prayers']);

/**
 * Tombstones that are never forgotten: for built-in entries and the lists the
 * app starts with, so a device that joins sync later can't bring back
 * something you deleted long ago.
 */
export const keepTombstone = (id) => id.startsWith(SEED_PREFIX) || DEFAULT_LIST_IDS.has(id);

export function defaultState(now = Date.now(), today = todayKey()) {
  // updated: 0 = "never edited", so a new device joining sync never overrides real lists.
  const list = (props) => ({ sort: 'added', items: [], updated: 0, since: today, ...props });
  return {
    schema: SCHEMA,
    lists: [
      list({ id: 'anglican', name: 'Anglican Cycle of Prayer', type: 'cycle', kind: 'acp', source: 'acp' }),
      list({ id: 'diocese', name: 'Diocesan Cycle', type: 'monthly' }),
      list({ id: 'diocese-daily', name: 'Diocesan Daily Cycle', type: 'dated' }),
      // Read at Morning Prayer a weekday at a time; in your own prayer, everyone every day.
      list({ id: 'trinity', name: 'Trinity', type: 'weekly', sort: 'last', morningPrayer: true, everyDay: true }),
      list({ id: 'requests', name: 'Prayer Requests', type: 'daily' }),
      list({ id: 'family', name: 'Family', type: 'daily' }),
      list({ id: 'clergy', name: 'Clergy', type: 'daily', sort: 'last' }),
      // Prayers and thanksgivings from the Prayer Book, chosen to pray one by one.
      list({ id: 'prayers', name: 'Prayers and Thanksgivings', type: 'daily', kind: 'prayers' }),
    ],
    checks: {},
    tombstones: {},
    settings: { palette: 'burgundy', foldShortMonths: true, theme: 'auto', showPrayers: true, rite: 'contemporary', updated: 0 },
    orderUpdated: 0,
    meta: { created: now, lastBackup: null, quickAddList: 'requests', durations: {} },
  };
}

/** Bring stored or imported data up to the current schema, filling gaps. */
export function migrate(data, now = Date.now(), today = todayKey()) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.lists)) throw new Error('Not Prayer Tracker data');
  const base = defaultState(now, today);
  const fromV1 = !data.schema || data.schema < 2;
  const lists = data.lists
    .filter((l) => l && typeof l.id === 'string' && LIST_TYPES.has(l.type))
    .map((l) => {
      const list = {
        ...l,
        name: String(l.name || 'Untitled list'),
        sort: ['added', 'last', 'alpha'].includes(l.sort) ? l.sort : 'added',
        updated: Number(l.updated) || 0,
        since: isValidKey(l.since) ? l.since : today,
        items: (Array.isArray(l.items) ? l.items : [])
          .filter((i) => i && typeof i.text === 'string' && i.text.trim())
          .map((i) => ({ ...i, id: typeof i.id === 'string' ? i.id : uid(), updated: Number(i.updated) || Number(i.created) || 0 })),
      };
      // Version 1 shipped the Anglican Cycle as an empty dated list to import into;
      // it is now built in.
      if (fromV1 && l.kind === 'acp' && l.type === 'dated' && !list.items.length) {
        list.type = 'cycle';
        list.source = 'acp';
      }
      // Before 2.3 the parish list was only a weekly list. It is now read at
      // Morning Prayer, with everyone every day in your own prayer, unless
      // you have chosen otherwise.
      if (l.id === 'trinity' && l.type === 'weekly' && l.morningPrayer === undefined && l.everyDay === undefined) {
        list.morningPrayer = true;
        list.everyDay = true;
      }
      return list;
    });
  return {
    schema: SCHEMA,
    lists,
    checks: data.checks && typeof data.checks === 'object' ? data.checks : {},
    tombstones: data.tombstones && typeof data.tombstones === 'object' ? data.tombstones : {},
    settings: { ...base.settings, ...(data.settings || {}) },
    orderUpdated: Number(data.orderUpdated) || 0,
    meta: { ...base.meta, ...(data.meta || {}) },
  };
}

/** The part of the state that is shared between devices. */
export function syncDocument(state) {
  const { schema, lists, checks, tombstones, settings, orderUpdated } = state;
  return JSON.parse(JSON.stringify({ schema, lists, checks, tombstones, settings, orderUpdated }));
}

/**
 * Make `target` win over `current` in any later merge: stamp everything in it
 * with `t`, and tombstone or un-check whatever only `current` has.
 */
export function stampAsNewest(target, current, t) {
  const inTarget = new Set();
  for (const l of target.lists) {
    l.updated = t;
    inTarget.add(l.id);
    for (const i of l.items) { i.updated = t; inTarget.add(i.id); }
    for (const o of Object.values(l.overrides || {})) o.updated = t;
  }
  target.tombstones = { ...(target.tombstones || {}) };
  for (const l of current.lists) {
    if (!inTarget.has(l.id)) target.tombstones[l.id] = t;
    for (const i of l.items) if (!inTarget.has(i.id)) target.tombstones[i.id] = t;
  }
  for (const id of inTarget) delete target.tombstones[id];
  const checks = {};
  for (const date of new Set([...Object.keys(current.checks || {}), ...Object.keys(target.checks || {})])) {
    const a = current.checks?.[date] || {};
    const b = target.checks?.[date] || {};
    for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const want = (b[id] || 0) > 0;
      if (!want && !((a[id] || 0) > 0) && !(id in b)) continue;
      (checks[date] ||= {})[id] = want ? t : -t;
    }
  }
  target.checks = checks;
  target.settings = { ...target.settings, updated: t };
  target.orderUpdated = t;
  return target;
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
  constructor(storage = safeLocalStorage(), { clock = () => Date.now() } = {}) {
    this.storage = storage;
    this.clock = clock;
    this.lastStamp = 0;
    this.persistent = !!storage;
    this.listeners = new Set();
    this.saveListeners = new Set();
    this.state = this.load();
    this.prune();
  }

  /** A timestamp that always moves forward on this device. */
  stamp() {
    this.lastStamp = Math.max(this.clock(), this.lastStamp + 1);
    return this.lastStamp;
  }

  // ---------- persistence ----------

  load() {
    let raw = null;
    try {
      raw = this.storage?.getItem(STORAGE_KEY);
    } catch {
      raw = null;
    }
    if (!raw) return defaultState(this.clock());
    try {
      return migrate(JSON.parse(raw), this.clock());
    } catch {
      // Keep unreadable data aside rather than overwrite it.
      try { this.storage.setItem(`${STORAGE_KEY}:unreadable:${Date.now()}`, raw); } catch { /* ignore */ }
      return defaultState(this.clock());
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
    for (const fn of this.saveListeners) fn();
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

  /** Called after every save, including silent ones (used to schedule a sync). */
  onSave(fn) {
    this.saveListeners.add(fn);
    return () => this.saveListeners.delete(fn);
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

  /** Undo to a snapshot, in a way that also wins on other synced devices. */
  restore(snap) {
    const target = JSON.parse(snap);
    this.commit((s) => {
      stampAsNewest(target, s, this.stamp());
      target.meta = s.meta;
      for (const k of Object.keys(s)) delete s[k];
      Object.assign(s, target);
    });
  }

  /** Take in a merged document from sync (keeps this device's own settings). */
  applySynced(doc) {
    this.commit((s) => {
      const meta = s.meta;
      for (const k of Object.keys(s)) delete s[k];
      Object.assign(s, migrate({ ...doc, meta }, this.clock()));
      for (const l of s.lists) l.items.sort((a, b) => (a.created || 0) - (b.created || 0) || (a.id < b.id ? -1 : 1));
    });
  }

  syncDocument() {
    return syncDocument(this.state);
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
    const t = this.stamp();
    const item = {
      id: uid(),
      text: String(entry.text).replace(/\s+/g, ' ').trim(),
      created: entry.created || t,
      updated: t,
      since: isValidKey(entry.since) ? entry.since : todayKey(new Date(this.clock())),
    };
    if (entry.note && String(entry.note).trim()) item.note = String(entry.note).trim();
    // An entry in Prayers and Thanksgivings: a Prayer Book prayer, or your own words.
    if (entry.prayer) item.prayer = String(entry.prayer);
    if (entry.prayerText && String(entry.prayerText).trim()) item.prayerText = String(entry.prayerText).trim();
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
    if (list.type === 'cycle') item.seq = Number.isInteger(entry.seq) && entry.seq >= 0 ? entry.seq : 0;
    if (entry.start) item.start = entry.start;
    if (entry.end) item.end = entry.end;
    return item;
  }

  validEntries(list, entries) {
    return entries
      .filter((e) => e && String(e.text || '').trim())
      .filter((e) => list.type !== 'dated' || isValidKey(e.date));
  }

  addItems(listId, entries) {
    return this.commit(() => {
      const list = this.list(listId);
      if (!list) return [];
      const added = this.validEntries(list, entries).map((e) => this.normalizeEntry(list, e));
      list.items.push(...added);
      return added;
    });
  }

  replaceItems(listId, entries) {
    return this.commit((s) => {
      const list = this.list(listId);
      if (!list) return [];
      const t = this.stamp();
      for (const i of list.items) s.tombstones[i.id] = t;
      list.items = this.validEntries(list, entries).map((e) => this.normalizeEntry(list, e));
      return list.items;
    });
  }

  /** Replace a cycle list's entries: one per day from `start`, in order (e.g. a newer Anglican Cycle). */
  replaceCycle(listId, { start, entries }) {
    return this.commit((s) => {
      const list = this.list(listId);
      if (!list || list.type !== 'cycle') return [];
      const t = this.stamp();
      for (const i of list.items) s.tombstones[i.id] = t;
      list.items = this.validEntries(list, entries).map((e) => this.normalizeEntry(list, e));
      list.start = start;
      list.updated = t;
      return list.items;
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
        const before = item[key];
        if (patch[key] == null || patch[key] === '') delete item[key];
        else item[key] = patch[key];
        // A new day starts fresh: earlier days don't count as missed.
        if ((key === 'day' || key === 'date') && before !== item[key]) item.since = todayKey(new Date(this.clock()));
      }
      item.updated = this.stamp();
      return item;
    });
  }

  /** Note that an entry was shared somewhere (say, Trinity's prayer list) on a date. */
  markShared(itemId, where, dateKey) {
    return this.commit(() => {
      const found = this.findItem(itemId);
      if (!found) return null;
      found.item.shared = { ...(found.item.shared || {}), [where]: dateKey };
      found.item.updated = this.stamp();
      return found.item;
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
      const base = { ...found.item, ...fields, since: null };
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
    return this.commit((s) => {
      const found = this.findItem(itemId);
      if (!found) return null;
      found.list.items.splice(found.index, 1);
      s.tombstones[itemId] = this.stamp();
      return { listId: found.list.id, index: found.index, item: found.item };
    });
  }

  /** Undo a deleteItem. */
  restoreItem({ listId, index, item }) {
    this.commit((s) => {
      const list = this.list(listId);
      if (!list) return;
      delete s.tombstones[item.id];
      list.items.splice(Math.min(index, list.items.length), 0, { ...item, updated: this.stamp() });
    });
  }

  removeEnded(listId, dateKey) {
    return this.commit((s) => {
      const list = this.list(listId);
      if (!list) return 0;
      const t = this.stamp();
      const before = list.items.length;
      list.items = list.items.filter((i) => {
        const ended = i.end && i.end < dateKey;
        if (ended) s.tombstones[i.id] = t;
        return !ended;
      });
      return before - list.items.length;
    });
  }

  /**
   * Spread a weekly list's names across the given weekdays in last-name order,
   * keeping people who share a last name on the same day. The days are kept
   * as the list's choice for next time.
   */
  distributeWeekly(listId, days = [1, 2, 3, 4, 5]) {
    return this.commit(() => {
      const list = this.list(listId);
      if (!list || !days.length) return;
      const t = this.stamp();
      list.spreadDays = [...days].sort();
      list.updated = t;
      const today = todayKey(new Date(this.clock()));
      for (const { day, items } of planSpread(list.items, days)) {
        for (const item of items) {
          if (item.day !== day) item.since = today;
          item.day = day;
          item.updated = t;
        }
      }
    });
  }

  /** Edit a built-in cycle entry (e.g. a diocese that has merged), or hide it. */
  overrideEntry(listId, entryId, patch) {
    this.commit(() => {
      const list = this.list(listId);
      if (!list) return;
      list.overrides ||= {};
      if (patch == null) {
        list.overrides[entryId] = { reset: true, updated: this.stamp() };
      } else {
        const prev = list.overrides[entryId]?.reset ? {} : list.overrides[entryId] || {};
        list.overrides[entryId] = { ...prev, ...patch, updated: this.stamp() };
        delete list.overrides[entryId].reset;
      }
    });
  }

  // ---------- built-in cycles copied into lists ----------

  /**
   * The first time this device runs, copy a built-in cycle (see seeds.js) into
   * its lists, adding any list it needs. A list that already has entries is
   * left alone, and so is anything you have deleted. The copied entries have
   * fixed ids and times, so two devices that both copy them agree when they
   * sync. Returns how many entries were added.
   */
  seed(seed) {
    if (this.state.meta.seeded?.[seed.id]) return 0;
    const today = todayKey(new Date(this.clock()));
    return this.commit((s) => {
      let added = 0;
      for (const part of seed.lists) {
        let list = s.lists.find((l) => l.id === part.list.id);
        if (!list) {
          if (s.tombstones[part.list.id]) continue;
          list = { sort: 'added', items: [], updated: 0, since: today, ...part.list };
          const after = s.lists.findIndex((l) => l.id === part.after);
          s.lists.splice(after >= 0 ? after + 1 : s.lists.length, 0, list);
        }
        if (list.type !== part.list.type || list.items.length) continue;
        part.entries.forEach((e, k) => {
          const item = seedItem(seed, e, k, today);
          if (s.tombstones[item.id]) return;
          list.items.push(item);
          added += 1;
        });
      }
      s.meta.seeded = { ...(s.meta.seeded || {}), [seed.id]: this.clock() };
      return added;
    });
  }

  /** Put a built-in cycle's entries back in one of its lists, in place of what is there. */
  reloadSeed(seed, listId) {
    const part = seed.lists.find((p) => p.list.id === listId);
    return this.commit((s) => {
      const list = this.list(listId);
      if (!part || !list || list.type !== part.list.type) return 0;
      const t = this.stamp();
      const today = todayKey(new Date(this.clock()));
      const items = part.entries.map((e, k) => ({ ...seedItem(seed, e, k, today), updated: t }));
      const ids = new Set(items.map((i) => i.id));
      for (const i of list.items) if (!ids.has(i.id)) s.tombstones[i.id] = t;
      for (const id of ids) delete s.tombstones[id];
      list.items = items;
      return items.length;
    });
  }

  // ---------- check-offs ----------

  isChecked(dateKey, itemId) {
    return (this.state.checks[dateKey]?.[itemId] || 0) > 0;
  }

  setChecked(dateKey, itemId, value, opts) {
    this.setCheckedMany([[dateKey, itemId]], value, opts);
  }

  /** Check or un-check several [dateKey, itemId] pairs at once. */
  setCheckedMany(pairs, value, opts) {
    this.commit((s) => {
      const t = this.stamp();
      for (const [dateKey, itemId] of pairs) (s.checks[dateKey] ||= {})[itemId] = value ? t : -t;
    }, opts);
  }

  prune(today = todayKey(new Date(this.clock()))) {
    const cutoff = addDays(today, -CHECK_RETENTION_DAYS);
    let changed = false;
    for (const k of Object.keys(this.state.checks)) {
      if (k < cutoff) {
        delete this.state.checks[k];
        changed = true;
      }
    }
    const oldest = this.clock() - TOMBSTONE_RETENTION_DAYS * 864e5;
    for (const [id, t] of Object.entries(this.state.tombstones)) {
      if (t < oldest && !keepTombstone(id)) {
        delete this.state.tombstones[id];
        changed = true;
      }
    }
    if (changed) this.save();
  }

  pruneChecks(today) {
    this.prune(today);
  }

  // ---------- lists ----------

  addList({ name, type, sort = 'added' }) {
    return this.commit((s) => {
      const list = {
        id: uid(),
        name: name.trim() || 'New list',
        type,
        sort,
        items: [],
        updated: this.stamp(),
        since: todayKey(new Date(this.clock())),
      };
      if (type === 'cycle') list.start = list.since;
      s.lists.push(list);
      return list;
    });
  }

  updateList(listId, patch) {
    return this.commit(() => {
      const list = this.list(listId);
      if (!list) return null;
      for (const key of ['name', 'sort', 'hidden', 'prayer', 'morningPrayer', 'everyDay']) if (key in patch) list[key] = patch[key];
      if (!list.hidden) delete list.hidden;
      if (list.prayer === undefined) delete list.prayer;
      list.updated = this.stamp();
      return list;
    });
  }

  deleteList(listId) {
    return this.commit((s) => {
      const index = s.lists.findIndex((l) => l.id === listId);
      if (index < 0) return null;
      const [list] = s.lists.splice(index, 1);
      s.tombstones[listId] = this.stamp();
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
      s.orderUpdated = this.stamp();
    });
  }

  // ---------- settings ----------

  setSetting(key, value) {
    this.commit((s) => {
      s.settings[key] = value;
      s.settings.updated = this.stamp();
    });
  }

  /** Device-only preferences (not synced). */
  setMeta(key, value) {
    this.commit((s) => { s.meta[key] = value; });
  }

  // ---------- backup ----------

  exportData() {
    return { app: 'prayer-tracker', schema: SCHEMA, exportedAt: new Date(this.clock()).toISOString(), data: this.state };
  }

  /** Replace everything with a backup file's contents. Throws if it isn't one. */
  importData(obj) {
    const data = obj && obj.app === 'prayer-tracker' ? obj.data : obj;
    const migrated = migrate(data, this.clock());
    this.commit((s) => {
      stampAsNewest(migrated, s, this.stamp());
      migrated.meta = { ...migrated.meta, created: s.meta.created };
      for (const k of Object.keys(s)) delete s[k];
      Object.assign(s, migrated);
    });
  }

  /** Start over on this device. (A synced copy elsewhere is left alone.) */
  eraseAll() {
    this.commit((s) => {
      for (const k of Object.keys(s)) delete s[k];
      Object.assign(s, defaultState(this.clock()));
    });
  }
}
