// Settings: appearance, cycle options, backup/restore, install help.

import { h, icon, toast, toggle, chipGroup, confirmSheet } from './ui.js';
import { todayKey, formatWithYear } from './dates.js';
import { dayTitle } from './calendar.js';
import { VERSION } from './version.js';
import { SEEDS } from './seeds.js';
import { TRINITY_FORM, shareName, pendingShares } from './share.js';

const field = (label, ...children) => h('div', { class: 'field' }, h('span', { class: 'field-label' }, label), children);
const card = (title, ...children) => h('section', { class: 'settings-card' }, h('h2', null, title), children);

/** Save everything to a .json file: the share sheet on phones, a download elsewhere. */
export async function saveBackup(app) {
  const json = JSON.stringify(app.store.exportData(), null, 1);
  const name = `prayer-tracker-backup-${todayKey()}.json`;
  const file = new File([json], name, { type: 'application/json' });
  const phone = matchMedia('(pointer: coarse)').matches;
  if (phone && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Prayer Tracker backup' });
      app.store.setMeta('lastBackup', Date.now());
      toast('Backup saved');
      return;
    } catch (e) {
      if (e?.name === 'AbortError') return;
      // Fall back to a download.
    }
  }
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: name, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  app.store.setMeta('lastBackup', Date.now());
  toast('Backup downloaded');
}

export function restoreBackup(app) {
  const input = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
      if (!(data?.app === 'prayer-tracker' || Array.isArray(data?.lists))) throw new Error('not a backup');
    } catch {
      toast('That file isn’t a Prayer Tracker backup.');
      return;
    }
    const when = data.exportedAt ? ` from ${formatWithYear(todayKey(new Date(data.exportedAt)))}` : '';
    const ok = await confirmSheet({
      title: `Restore the backup${when}?`,
      message: 'Everything in the app now will be replaced by what is in the backup.',
      confirm: 'Restore',
      danger: true,
    });
    if (!ok) return;
    const snap = app.store.snapshot();
    try {
      app.store.importData(data);
      toast('Backup restored', { action: 'Undo', onAction: () => app.store.restore(snap) });
    } catch {
      toast('That backup couldn’t be read.');
    }
  });
  document.body.append(input);
  input.click();
}

function ago(ms) {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return formatWithYear(todayKey(new Date(ms)));
}

/** Sharing requests with Trinity: the name they're sent under. */
function shareCard(app) {
  const { store } = app;
  const form = TRINITY_FORM;
  const waiting = pendingShares(store).length;
  const name = h('input', {
    class: 'input',
    value: shareName(store),
    autocomplete: 'name',
    autocapitalize: 'words',
    'aria-label': 'Your name on Trinity’s form',
    onchange: (e) => {
      const value = e.target.value.trim() || form.defaultName;
      e.target.value = value;
      const prev = store.state.settings.share?.[form.id] || {};
      if (value !== shareName(store)) store.setSetting('share', { ...(store.state.settings.share || {}), [form.id]: { ...prev, name: value } });
    },
  });
  return card('Sharing with Trinity',
    h('p', null, 'Prayer requests you share with Trinity go to its prayer request form under this name, worded as you wrote them.'),
    field('Your name (first and last)', name),
    waiting > 0 && h('p', { class: 'hint' }, `${waiting === 1 ? 'One request is' : `${waiting} requests are`} waiting to go, and will be sent when there’s a connection.`));
}

function syncCard(app) {
  const { sync } = app;
  if (!sync) return null;
  if (sync.enabled) {
    const st = sync.status;
    const line = st.state === 'syncing' ? 'Syncing…'
      : st.state === 'error' ? st.message
        : st.at ? `Last synced ${ago(st.at)}.` : 'Not synced yet.';
    return card('Sync across devices',
      h('p', null, 'Syncing with ', h('strong', null, sync.repo), ' on GitHub.'),
      h('p', { class: `hint sync-status ${st.state === 'error' ? 'is-error' : ''}`, 'aria-live': 'polite' }, line),
      h('div', { class: 'button-row' },
        h('button', { class: 'btn btn-primary', type: 'button', disabled: st.state === 'syncing', onclick: () => sync.sync() }, 'Sync now'),
        h('button', {
          class: 'btn',
          type: 'button',
          onclick: async () => {
            const ok = await confirmSheet({
              title: 'Turn off sync on this device?',
              message: 'Your lists stay on this device and in the repository; they just stop being kept in step here.',
              confirm: 'Turn off',
            });
            if (ok) { sync.disconnect(); app.render(); }
          },
        }, 'Turn off')));
  }
  const repo = h('input', { class: 'input', placeholder: 'yourname/prayer-data', autocapitalize: 'none', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Repository' });
  const token = h('input', { class: 'input', type: 'password', placeholder: 'github_pat_…', autocomplete: 'off', 'aria-label': 'Access token' });
  const status = h('p', { class: 'hint sync-status', 'aria-live': 'polite' });
  const connect = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Connect');
  const form = h('form', { class: 'sync-form', novalidate: true }, field('Repository', repo), field('Access token', token), status, connect);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    connect.disabled = true;
    status.classList.remove('is-error');
    status.textContent = 'Connecting…';
    try {
      await sync.connect(repo.value, token.value);
      toast('Sync is on');
      app.render();
    } catch (err) {
      status.textContent = err.message;
      status.classList.add('is-error');
      connect.disabled = false;
    }
  });
  return card('Sync across devices',
    h('p', null, 'Keep the same lists on your phone, iPad and computer. They’re saved as one file in a private GitHub repository of your own, and each device keeps working offline.'),
    h('ol', { class: 'steps' },
      h('li', null, 'On GitHub, create a new ', h('strong', null, 'private'), ' repository, for example ', h('code', null, 'prayer-data'), '.'),
      h('li', null, 'Make a ', h('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener' }, 'fine-grained access token'),
        '. Under Repository access choose “Only select repositories” and pick that repository; under Permissions set ', h('strong', null, 'Contents'), ' to “Read and write”.'),
      h('li', null, 'Enter both below, and do the same on each device. The token stays on the device; it isn’t synced or put in backups.')),
    form);
}

export function renderSettings(app) {
  const { store } = app;
  const s = store.state.settings;
  const meta = store.state.meta;
  const { ios, android, standalone } = app.platform;

  const installSteps = [];
  if (standalone) {
    installSteps.push(h('p', null, 'Installed. Open it from your Home Screen.'));
  } else if (app.installPrompt) {
    installSteps.push(h('button', {
      class: 'btn btn-primary',
      type: 'button',
      onclick: async () => {
        const prompt = app.installPrompt;
        app.installPrompt = null;
        await prompt.prompt();
        app.render();
      },
    }, icon('download'), 'Install the app'));
  }
  if (!standalone) {
    installSteps.push(
      h('p', { class: ios ? 'install-here' : '' }, h('strong', null, 'iPhone or iPad: '), 'open this page in Safari, tap Share, then Add to Home Screen.'),
      h('p', { class: android ? 'install-here' : '' }, h('strong', null, 'Android: '), 'in Chrome, tap ⋮ then Install app (or Add to Home screen).'),
    );
  }
  installSteps.push(h('p', { class: 'hint' }, 'On Android, long-press the app icon for a quick “Add a prayer request”, and use Share in any app (Messages, email) to send text straight to a new request.'));

  return [
    h('header', { class: 'page-head' },
      h('a', { class: 'back-link', href: '#/lists' }, icon('left'), 'Lists'),
      h('span')),
    h('h1', { class: 'page-title' }, 'Settings'),

    card('Appearance',
      field('Colour', chipGroup({
        label: 'Colour',
        className: 'chips-palette',
        value: s.palette || 'burgundy',
        options: [{ value: 'burgundy', label: 'Burgundy' }, { value: 'blue', label: 'Blue' }, { value: 'season', label: 'Church year' }],
        onChange: (v) => store.setSetting('palette', v),
      })),
      h('p', { class: 'hint' }, `Church year colours the app by the liturgical day: now ${dayTitle(app.today).color}, ${dayTitle(app.today).title}. The ribbon on Today always shows the day’s colour.`),
      field('Theme', chipGroup({
        label: 'Theme',
        value: s.theme,
        options: [{ value: 'auto', label: 'Match device' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }],
        onChange: (v) => store.setSetting('theme', v),
      }))),

    card('Prayers',
      toggle({
        label: 'Show each list’s prayer',
        hint: 'A prayer from the Prayer Book opens each list on Today and in pray-through. To change one, open the list and tap ⋯.',
        checked: s.showPrayers !== false,
        onChange: (v) => store.setSetting('showPrayers', v),
      })),

    shareCard(app),

    syncCard(app),

    card('Monthly cycles',
      toggle({
        label: 'Catch up in shorter months',
        hint: 'On the last day of a short month, also pray for the days it doesn’t have. February 28 shows days 28–31, so no church is missed.',
        checked: s.foldShortMonths !== false,
        onChange: (v) => store.setSetting('foldShortMonths', v),
      })),

    card('Backup',
      h('p', null, app.sync?.enabled
        ? 'Your lists are synced, but a backup file is still a good idea now and then.'
        : 'Your lists are kept only on this device. Save a backup now and then, and before you change phones.'),
      h('p', { class: 'hint' }, meta.lastBackup ? `Last backup: ${formatWithYear(todayKey(new Date(meta.lastBackup)))}` : 'No backup saved yet.'),
      h('div', { class: 'button-row' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => saveBackup(app) }, icon('download'), 'Save a backup'),
        h('button', { class: 'btn', type: 'button', onclick: () => restoreBackup(app) }, icon('upload'), 'Restore a backup'))),

    card('Home Screen', ...installSteps),

    card('About',
      h('p', null, `Prayer Tracker ${VERSION}. Nothing you enter leaves this device: there are no accounts and no tracking.`),
      h('button', {
        class: 'btn btn-danger',
        type: 'button',
        onclick: async () => {
          const ok = await confirmSheet({
            title: 'Erase everything?',
            message: app.sync?.enabled
              ? 'All lists, names and check-offs on this device will be deleted, and sync turned off here. The synced copy on GitHub is not touched.'
              : 'All lists, names and check-offs on this device will be deleted. Save a backup first if you might want them back.',
            confirm: 'Erase',
            danger: true,
          });
          if (!ok) return;
          app.sync?.disconnect();
          const snap = store.snapshot();
          store.eraseAll();
          for (const seed of SEEDS) store.seed(seed); // as on a first run
          toast('Erased', { action: 'Undo', onAction: () => store.restore(snap) });
        },
      }, icon('trash'), 'Erase all data')),
  ];
}
