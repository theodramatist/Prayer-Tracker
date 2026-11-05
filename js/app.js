// App start-up: state, routing, day rollover, theme, and the quick-add links
// (?add, and ?text= from the Android share sheet).

import { Store, STORAGE_KEY } from './store.js';
import { todayKey, addDays, isValidKey } from './dates.js';
import { dayTitle } from './calendar.js';
import { SyncManager } from './sync.js';
import { LffLibrary } from './lff.js';
import { trackVisualViewport, toast, closeAllSheets } from './ui.js';
import { renderToday } from './today.js';
import { renderLists, renderListDetail } from './lists.js';
import { renderSettings } from './settings.js';
import { openAddSheet } from './sheets.js';
import { SEEDS } from './seeds.js';
import { flushOutbox, pendingShares } from './share.js';

const UI_KEY = 'prayer-tracker:ui';
const root = document.documentElement;
const view = document.getElementById('view');

const store = new Store();
for (const seed of SEEDS) store.seed(seed); // first run on this device: the diocese's cycles
const lff = new LffLibrary(store.storage);
const sync = new SyncManager(store, { library: lff });

const ua = navigator.userAgent;
const platform = {
  ios: /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  android: /android/i.test(ua),
  standalone: navigator.standalone === true || matchMedia('(display-mode: standalone)').matches,
};

function readUi() {
  try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}'); } catch { return {}; }
}

function writeUi(patch) {
  try { localStorage.setItem(UI_KEY, JSON.stringify({ ...readUi(), ...patch })); } catch { /* ignore */ }
}

const app = {
  store,
  sync,
  lff,
  platform,
  today: todayKey(),
  viewDate: todayKey(),
  filter: readUi().filter || 'all',
  showDone: false,
  installPrompt: null,
  route: parseRoute(),

  render,
  setDate(key) {
    if (!isValidKey(key)) return;
    this.viewDate = key;
    this.showDone = false;
    render();
  },
  shiftDay(n) {
    this.setDate(addDays(this.viewDate, n));
  },
  setFilter(id) {
    this.filter = id;
    writeUi({ filter: id });
    render();
  },
  navigate(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  },
  /**
   * Keep a copy of Lesser Feasts and Fasts as read from its PDF (or a backup),
   * or remove it (null), here and, through sync, on your other devices.
   */
  setLff(book) {
    const updated = store.stamp();
    if (!book) {
      lff.clear();
      store.setLibrary('lff', { removed: true, updated });
      return true;
    }
    const data = { edition: book.edition, title: book.title, feasts: book.feasts, updated };
    if (!lff.save(data)) return false;
    store.setLibrary('lff', { edition: data.edition, title: data.title, count: data.feasts.length, updated });
    return true;
  },
};

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  if (parts[0] === 'lists') return { name: 'lists' };
  if (parts[0] === 'list' && parts[1]) return { name: 'list', id: decodeURIComponent(parts[1]) };
  if (parts[0] === 'settings') return { name: 'settings' };
  return { name: 'today' };
}

function render() {
  let nodes;
  switch (app.route.name) {
    case 'lists': nodes = renderLists(app); break;
    case 'list': nodes = renderListDetail(app, app.route.id); break;
    case 'settings': nodes = renderSettings(app); break;
    default: nodes = renderToday(app);
  }
  view.replaceChildren(...[nodes].flat(Infinity).filter((n) => n instanceof Node));
  for (const tab of document.querySelectorAll('.tabbar [data-tab]')) {
    const active = tab.dataset.tab === (app.route.name === 'today' ? 'today' : 'lists');
    tab.classList.toggle('active', active);
    if (active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  applyTheme();
}

// ---------- theme & season ----------

const darkQuery = matchMedia('(prefers-color-scheme: dark)');

const PALETTES = ['burgundy', 'blue', 'season'];

function applyTheme() {
  const { theme = 'auto', palette = 'burgundy' } = store.state.settings;
  const dark = theme === 'dark' || (theme === 'auto' && darkQuery.matches);
  const nextTheme = dark ? 'dark' : 'light';
  const nextPalette = PALETTES.includes(palette) ? palette : 'burgundy';
  // With the "Church year" palette, the accent is the liturgical colour of the day.
  const nextSeason = dayTitle(app.today).color;
  const d = root.dataset;
  if (d.theme === nextTheme && d.palette === nextPalette && d.season === nextSeason) return;
  d.theme = nextTheme;
  d.palette = nextPalette;
  d.season = nextSeason;
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || (dark ? '#161110' : '#f6f0e8'));
  writeUi({ theme: nextTheme, palette: nextPalette, season: nextSeason });
}

darkQuery.addEventListener?.('change', applyTheme);

// ---------- events ----------

let pending = false;
store.subscribe(() => {
  // Coalesce several changes in one tick into one render.
  if (pending) return;
  pending = true;
  queueMicrotask(() => { pending = false; render(); });
});

window.addEventListener('hashchange', () => {
  app.route = parseRoute();
  app.reorderLists = false;
  closeAllSheets();
  render();
  window.scrollTo(0, 0);
});

window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) store.reload();
});

// Sync: on launch, when the app comes back to the front, when the connection
// returns, every few minutes while open, and shortly after any change.
let lastSyncState = sync.status.state;
sync.onChange((status) => {
  const settled = status.state !== 'syncing';
  if (app.route.name === 'settings' || (settled && (status.state === 'error' || lastSyncState === 'error'))) render();
  if (settled) lastSyncState = status.state;
});
const syncIfOn = () => { if (sync.enabled && !document.hidden) sync.sync(); };
document.addEventListener('visibilitychange', syncIfOn);
window.addEventListener('online', syncIfOn);
setInterval(syncIfOn, 5 * 60 * 1000);

// Prayer requests waiting to go to Trinity (shared while offline, say): sent
// on opening, when the connection returns, and when the app comes back to the
// front, but never while one can still be undone.
const sendWaiting = async () => {
  if (document.hidden || !pendingShares(store).length) return;
  const { sent } = await flushOutbox(store, { minAge: app.shareDelay ?? 5000 });
  if (sent) toast(sent === 1 ? 'Sent a waiting request to Trinity’s prayer list' : `Sent ${sent} waiting requests to Trinity’s prayer list`);
};
document.addEventListener('visibilitychange', sendWaiting);
window.addEventListener('online', sendWaiting);
setTimeout(sendWaiting, 3000);

/** Midnight: move "today" forward (and the view with it, if it was showing today). */
function checkRollover() {
  const t = todayKey();
  if (t === app.today) return;
  const followToday = app.viewDate === app.today;
  app.today = t;
  if (followToday) app.viewDate = t;
  store.pruneChecks(t);
  render();
}
setInterval(checkRollover, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkRollover(); });
window.addEventListener('pageshow', checkRollover);

document.querySelector('.tab-add')?.addEventListener('click', () => {
  const listId = app.route.name === 'list' ? app.route.id : (app.route.name === 'today' && app.filter !== 'all' ? app.filter : null);
  openAddSheet(app, { listId });
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  app.installPrompt = e;
  if (app.route.name === 'settings') render();
});

// ---------- start ----------

trackVisualViewport();
render();
document.body.classList.add('ready');
syncIfOn();

// Quick-add links: ./?add opens the add sheet; the Android share sheet sends ?title=&text=&url=.
const params = new URLSearchParams(location.search);
if (params.has('add') || params.has('text') || params.has('title') || params.has('url')) {
  const shared = [params.get('title'), params.get('text'), params.get('url')]
    .map((v) => (v || '').trim())
    .filter((v, i, arr) => v && arr.indexOf(v) === i)
    .join(' ');
  const listId = params.get('list');
  history.replaceState(null, '', location.pathname + location.hash);
  openAddSheet(app, { text: shared || params.get('add') || '', listId });
}

// Offline copy and updates. The browser keeps the app to work offline, so a
// new version only runs once the page reloads: look for one whenever the app
// comes back to the front (and hourly), and switch to it as soon as that won't
// interrupt anything: straight away if it arrives as the app opens, otherwise
// the next time you come back to it, with a banner on Today meanwhile.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  const hadController = !!navigator.serviceWorker.controller;
  const openedAt = Date.now();
  const busy = () => !!document.querySelector('dialog[open]');
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    let lastCheck = Date.now();
    const check = () => {
      if (Date.now() - lastCheck < 10 * 60 * 1000) return;
      lastCheck = Date.now();
      reg.update().catch(() => { /* offline */ });
    };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    setInterval(check, 60 * 60 * 1000);
  }).catch(() => { /* offline support unavailable */ });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    if (Date.now() - openedAt < 10000 && !busy()) { location.reload(); return; }
    app.updateReady = true;
    render();
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && app.updateReady && !busy()) location.reload();
  });
}

// For debugging from the console and for the end-to-end tests.
window.prayerTracker = app;
