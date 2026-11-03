// App start-up: state, routing, day rollover, theme, and the quick-add links
// (?add, and ?text= from the Android share sheet).

import { Store, STORAGE_KEY } from './store.js';
import { todayKey, addDays, isValidKey } from './dates.js';
import { season } from './liturgy.js';
import { trackVisualViewport, toast, closeAllSheets } from './ui.js';
import { renderToday } from './today.js';
import { renderLists, renderListDetail } from './lists.js';
import { renderSettings } from './settings.js';
import { openAddSheet } from './sheets.js';

const UI_KEY = 'prayer-tracker:ui';
const root = document.documentElement;
const view = document.getElementById('view');

const store = new Store();

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

function applyTheme() {
  const { theme = 'auto', seasonalColor = true } = store.state.settings;
  const dark = theme === 'dark' || (theme === 'auto' && darkQuery.matches);
  const nextTheme = dark ? 'dark' : 'light';
  const nextSeason = seasonalColor ? season(app.today).color : 'none';
  if (root.dataset.theme === nextTheme && root.dataset.season === nextSeason) return;
  root.dataset.theme = nextTheme;
  root.dataset.season = nextSeason;
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || (dark ? '#141311' : '#f7f4ee'));
  writeUi({ theme: nextTheme, season: nextSeason });
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

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./sw.js').catch(() => { /* offline support unavailable */ });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    toast('The app has been updated.', { action: 'Reload', onAction: () => location.reload(), duration: 15000 });
  });
}

// For debugging from the console and for the end-to-end tests.
window.prayerTracker = app;
