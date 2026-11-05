// Sync between devices through one JSON file in a private GitHub repository
// that you own. Each device keeps working offline; when it syncs it merges its
// copy with the file (newest change wins, item by item) and writes the result
// back. The access token stays on the device and never goes in backups.

import { SCHEMA, migrate, syncDocument, keepTombstone } from './store.js';
import { addDays, todayKey } from './dates.js';

const CONFIG_KEY = 'prayer-tracker:sync';
/** Lesser Feasts and Fasts goes in a file of its own, written once each time it's loaded. */
export const LFF_FILE = 'lesser-feasts-and-fasts.json';
const API = 'https://api.github.com';

const at = (x) => Number(x?.updated) || 0;
const CHECK_DAYS = 120;
const TOMBSTONE_DAYS = 180;
const byCreated = (x, y) => (x.created || 0) - (y.created || 0) || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);

/**
 * The copy changed last. Two copies changed at the same moment (such as a
 * built-in cycle each device copied in itself) are told apart by their
 * contents, so every device picks the same one and the merge comes out the
 * same whichever way round it is done.
 */
function newer(x, y, content = canonical) {
  if (!x || !y) return x || y;
  if (at(x) !== at(y)) return at(x) > at(y) ? x : y;
  return content(y) < content(x) ? y : x;
}

const listContent = (l) => canonical({ ...l, items: undefined, overrides: undefined });

/**
 * Merge two sync documents. Lists, items and edits to built-in entries keep
 * whichever copy changed last; a deletion wins over anything older; each
 * check-off keeps its latest state; list order and settings come from
 * whichever device changed them last. mergeStates(a, b) and mergeStates(b, a)
 * give the same result.
 */
export function mergeStates(a, b, { now = Date.now() } = {}) {
  const tombstones = { ...(a.tombstones || {}) };
  for (const [id, t] of Object.entries(b.tombstones || {})) tombstones[id] = Math.max(tombstones[id] || 0, t);

  const aLists = new Map(a.lists.map((l) => [l.id, l]));
  const bLists = new Map(b.lists.map((l) => [l.id, l]));
  const lists = [];
  for (const id of new Set([...aLists.keys(), ...bLists.keys()])) {
    const la = aLists.get(id);
    const lb = bLists.get(id);
    const newest = newer(la, lb, listContent);
    if (tombstones[id] && tombstones[id] >= at(newest)) continue;

    const items = new Map();
    for (const it of [...(la?.items || []), ...(lb?.items || [])]) items.set(it.id, newer(items.get(it.id), it));
    const overrides = {};
    for (const src of [la?.overrides, lb?.overrides]) {
      for (const [k, o] of Object.entries(src || {})) overrides[k] = newer(overrides[k], o);
    }
    const merged = {
      ...newest,
      items: [...items.values()].filter((it) => !(tombstones[it.id] >= at(it))).sort(byCreated),
    };
    if (Object.keys(overrides).length) merged.overrides = overrides;
    else delete merged.overrides;
    lists.push(merged);
  }

  // The order of whichever copy was reordered last. A list only the other copy
  // has goes after the list it follows there.
  const idsA = a.lists.map((l) => l.id);
  const idsB = b.lists.map((l) => l.id);
  const first = newer({ updated: a.orderUpdated, ids: idsA }, { updated: b.orderUpdated, ids: idsB }, (o) => JSON.stringify(o.ids));
  const second = first.ids === idsA ? idsB : idsA;
  const order = [...first.ids];
  for (const [i, id] of second.entries()) {
    if (order.includes(id)) continue;
    const before = second.slice(0, i).reverse().find((x) => order.includes(x));
    order.splice(before ? order.indexOf(before) + 1 : 0, 0, id);
  }
  lists.sort((x, y) => order.indexOf(x.id) - order.indexOf(y.id));

  const checks = {};
  for (const src of [a.checks, b.checks]) {
    for (const [date, m] of Object.entries(src || {})) {
      const out = (checks[date] ||= {});
      for (const [id, v] of Object.entries(m)) {
        const prev = out[id];
        if (prev === undefined || Math.abs(v) > Math.abs(prev) || (Math.abs(v) === Math.abs(prev) && v > prev)) out[id] = v;
      }
    }
  }

  // Forget old check-offs and tombstones, as each device does, so the file stays small.
  const cutoff = addDays(todayKey(new Date(now)), -CHECK_DAYS);
  for (const date of Object.keys(checks)) if (date < cutoff) delete checks[date];
  const keptTombstones = {};
  for (const [id, t] of Object.entries(tombstones)) if (t >= now - TOMBSTONE_DAYS * 864e5 || keepTombstone(id)) keptTombstones[id] = t;

  // Which copy of each book is current: the one loaded (or removed) last.
  const library = {};
  for (const key of new Set([...Object.keys(a.library || {}), ...Object.keys(b.library || {})])) {
    library[key] = newer(a.library?.[key], b.library?.[key]);
  }

  return {
    schema: SCHEMA,
    lists,
    checks,
    tombstones: keptTombstones,
    settings: newer(a.settings, b.settings) || {},
    library,
    orderUpdated: Math.max(a.orderUpdated || 0, b.orderUpdated || 0),
  };
}

/** JSON with sorted keys, so two copies of the same data compare equal. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).filter((k) => value[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export const sameDoc = (x, y) => canonical(x) === canonical(y);

// ---------- GitHub ----------

export function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function fromBase64(b64) {
  return new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));
}

export class SyncError extends Error {
  constructor(message, { status = 0, conflict = false, auth = false } = {}) {
    super(message);
    this.status = status;
    this.conflict = conflict;
    this.auth = auth;
  }
}

async function describe(res, what) {
  let detail = '';
  try { detail = (await res.json()).message || ''; } catch { /* no body */ }
  if (res.status === 401) return new SyncError('GitHub didn’t accept the token. It may have expired; make a new one.', { status: 401, auth: true });
  if (res.status === 403 && /rate limit/i.test(detail)) return new SyncError('GitHub’s rate limit was reached. Sync will try again later.', { status: 403 });
  if (res.status === 403) return new SyncError('The token isn’t allowed to do this. It needs Contents: Read and write on the repository.', { status: 403, auth: true });
  if (res.status === 404) return new SyncError('That repository wasn’t found, or the token can’t see it.', { status: 404, auth: true });
  return new SyncError(`GitHub couldn’t ${what} (${res.status}${detail ? `: ${detail}` : ''}).`, { status: res.status });
}

export class GitHubFile {
  constructor({ repo, token, path = 'prayer-tracker.json' }, fetchImpl = globalThis.fetch.bind(globalThis)) {
    const [owner, name] = String(repo).split('/');
    this.owner = owner;
    this.name = name;
    this.token = token;
    this.path = path;
    this.fetch = fetchImpl;
  }

  get headers() {
    return { Authorization: `Bearer ${this.token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  }

  get repoUrl() {
    return `${API}/repos/${encodeURIComponent(this.owner)}/${encodeURIComponent(this.name)}`;
  }

  get fileUrl() {
    return `${this.repoUrl}/contents/${this.path.split('/').map(encodeURIComponent).join('/')}`;
  }

  async call(url, init, what) {
    let res;
    try {
      res = await this.fetch(url, { cache: 'no-store', ...init, headers: { ...this.headers, ...(init?.headers || {}) } });
    } catch {
      throw new SyncError('Couldn’t reach GitHub. Sync will try again when you’re online.');
    }
    if (res.status === 409 || res.status === 422) throw new SyncError('Someone else saved first.', { status: res.status, conflict: true });
    if (!res.ok && res.status !== 404) throw await describe(res, what);
    return res;
  }

  /** Check the repository is reachable and private. */
  async checkRepo() {
    const res = await this.call(this.repoUrl, {}, 'open the repository');
    if (res.status === 404) throw await describe(res, 'open the repository');
    const repo = await res.json();
    return { private: !!repo.private, fullName: repo.full_name };
  }

  /** The file's contents and version, or null if it doesn't exist yet. */
  async read() {
    const res = await this.call(this.fileUrl, {}, 'read the file');
    if (res.status === 404) return null;
    const body = await res.json();
    let text;
    if (body.encoding === 'base64' && body.content) {
      text = fromBase64(body.content);
    } else {
      // Over 1 MB the contents API leaves the content out; ask for the raw file.
      const raw = await this.call(this.fileUrl, { headers: { Accept: 'application/vnd.github.raw+json' } }, 'read the file');
      text = await raw.text();
    }
    return { sha: body.sha, data: JSON.parse(text) };
  }

  async write(data, sha) {
    const body = { message: 'Prayer Tracker sync', content: toBase64(JSON.stringify(data)) };
    if (sha) body.sha = sha;
    const res = await this.call(this.fileUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }, 'save the file');
    if (res.status === 404) throw await describe(res, 'save the file');
    const out = await res.json();
    return { sha: out.content?.sha };
  }
}

// ---------- the sync loop ----------

export function loadSyncConfig(storage = globalThis.localStorage) {
  try { return JSON.parse(storage.getItem(CONFIG_KEY) || 'null'); } catch { return null; }
}

function saveSyncConfig(config, storage = globalThis.localStorage) {
  try {
    if (config) storage.setItem(CONFIG_KEY, JSON.stringify(config));
    else storage.removeItem(CONFIG_KEY);
  } catch { /* storage unavailable */ }
}

export class SyncManager {
  constructor(store, { fetchImpl, storage = globalThis.localStorage, library = null } = {}) {
    this.store = store;
    this.library = library;
    this.fetchImpl = fetchImpl;
    this.storage = storage;
    this.config = loadSyncConfig(storage);
    this.status = this.config ? { state: 'idle', at: this.config.lastSync || null } : { state: 'off' };
    this.listeners = new Set();
    this.timer = null;
    this.running = null;
    this.again = false;
    this.applying = false;
    store.onSave(() => { if (!this.applying) this.schedule(); });
  }

  get enabled() {
    return !!(this.config?.repo && this.config?.token);
  }

  get repo() {
    return this.config?.repo || '';
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  setStatus(status) {
    this.status = status;
    for (const fn of this.listeners) fn(status);
  }

  file(config = this.config) {
    return new GitHubFile(config, this.fetchImpl || globalThis.fetch.bind(globalThis));
  }

  /** Check the repository and token, then make the first sync. */
  async connect(repo, token) {
    const config = { repo: repo.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, ''), token: token.trim() };
    if (!/^[\w.-]+\/[\w.-]+$/.test(config.repo)) throw new SyncError('Enter the repository as owner/name, for example theodramatist/prayer-data.');
    if (!config.token) throw new SyncError('Paste the access token.');
    const info = await this.file(config).checkRepo();
    if (!info.private) throw new SyncError(`${info.fullName} is public. Use a private repository so your prayer list stays private.`);
    this.config = config;
    saveSyncConfig(config, this.storage);
    await this.sync();
    if (this.status.state === 'error') throw new SyncError(this.status.message);
    return info;
  }

  disconnect() {
    clearTimeout(this.timer);
    this.config = null;
    saveSyncConfig(null, this.storage);
    this.setStatus({ state: 'off' });
  }

  schedule(delay = 2500) {
    if (!this.enabled) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.sync(), delay);
  }

  sync() {
    if (!this.enabled) return Promise.resolve();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    clearTimeout(this.timer);
    this.running = this.run().finally(() => {
      this.running = null;
      if (this.again) {
        this.again = false;
        this.schedule(300);
      }
    });
    return this.running;
  }

  async run() {
    this.setStatus({ ...this.status, state: 'syncing' });
    const file = this.file();
    try {
      for (let attempt = 0; ; attempt++) {
        const remote = await file.read();
        if (remote && Number(remote.data?.schema) > SCHEMA) {
          throw new SyncError('The synced copy was saved by a newer version of the app. Reload to update this device.');
        }
        const local = this.store.syncDocument();
        const remoteDoc = remote ? syncDocument(migrate(remote.data)) : null;
        const merged = remoteDoc ? mergeStates(local, remoteDoc) : local;
        if (!sameDoc(merged, local)) {
          this.applying = true;
          try { this.store.applySynced(merged); } finally { this.applying = false; }
        }
        // Before the main file says a new copy of a book is current, put it in the repository.
        await this.syncLibrary(remoteDoc);
        if (remoteDoc && sameDoc(this.store.syncDocument(), remoteDoc)) break;
        try {
          await file.write(this.store.syncDocument(), remote?.sha);
          break;
        } catch (e) {
          if (!e.conflict || attempt >= 3) throw e;
        }
      }
      const now = Date.now();
      this.config = { ...this.config, lastSync: now };
      saveSyncConfig(this.config, this.storage);
      this.setStatus({ state: 'idle', at: now });
    } catch (e) {
      this.setStatus({ state: 'error', message: e.message || 'Sync failed.', auth: !!e.auth, at: this.config?.lastSync || null });
    }
  }

  /**
   * Lesser Feasts and Fasts, kept on this device apart from the lists (see
   * lff.js), goes back and forth in its own file, so the main file stays
   * small: the main file only says which copy is current. The device that
   * loaded the current copy writes it; the others fetch it once.
   */
  async syncLibrary(remoteDoc) {
    const lib = this.library;
    if (!lib) return;
    const current = this.store.state.library?.lff || null;
    if (!current) return;
    if (current.removed) {
      if (lib.data) lib.clear();
      return;
    }
    const file = this.file({ ...this.config, path: LFF_FILE });
    if (lib.data?.updated === current.updated) {
      if (remoteDoc?.library?.lff?.updated === current.updated) return; // already there
      const there = await file.read();
      if (there?.data?.updated === current.updated) return;
      await file.write(lib.data, there?.sha);
      return;
    }
    const there = await file.read();
    if (there?.data?.updated === current.updated && Array.isArray(there.data.feasts)) lib.save(there.data);
  }
}
