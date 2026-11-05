// Settings: appearance, cycle options, backup/restore, install help.

import { h, icon, toast, toggle, chipGroup, confirmSheet } from './ui.js';
import { todayKey, formatWithYear } from './dates.js';
import { dayTitle } from './calendar.js';
import { VERSION } from './version.js';
import { SEEDS } from './seeds.js';
import { TRINITY_FORM, shareName, pendingShares } from './share.js';
import { RITES, DEFAULT_RITE } from './prayers.js';
import { openPrayerPicker } from './sheets.js';
import { LFF_URL, readLffPdf } from './lff.js';

const field = (label, ...children) => h('div', { class: 'field' }, h('span', { class: 'field-label' }, label), children);
const card = (title, ...children) => h('section', { class: 'settings-card' }, h('h2', null, title), children);

/** Save everything to a .json file: the share sheet on phones, a download elsewhere. */
export async function saveBackup(app) {
  // Lesser Feasts and Fasts goes in the backup too, so a restore brings it back.
  const json = JSON.stringify({ ...app.store.exportData(), ...(app.lff?.data ? { lff: app.lff.data } : {}) }, null, 1);
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
      if (Array.isArray(data.lff?.feasts)) app.setLff(data.lff);
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

/**
 * Lesser Feasts and Fasts, from your own copy of the PDF: read on this
 * device, kept here, and passed to your other devices only by your own sync.
 */
function lffCard(app) {
  const { store, lff } = app;
  const s = store.state.settings;
  const current = store.state.library?.lff;
  const status = h('p', { class: 'hint lff-status', 'aria-live': 'polite' });
  const input = h('input', { type: 'file', accept: '.pdf,application/pdf', hidden: true });
  const choose = h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => input.click() }, icon('upload'), lff.data ? 'Load a newer copy' : 'Choose the PDF');
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    choose.disabled = true;
    status.classList.remove('is-error');
    status.textContent = 'Opening the PDF…';
    try {
      const book = await readLffPdf(file, (p, n) => { status.textContent = `Reading page ${p} of ${n}…`; });
      if (!book.feasts.length) throw new Error('Couldn’t find the lesser feasts in this PDF.');
      if (!app.setLff(book)) throw new Error('There isn’t room to keep it on this device.');
      const missed = book.problems.length ? ` (${book.problems.length} couldn’t be read)` : '';
      toast(`${book.title}: ${book.feasts.length} lesser feasts added${missed}`);
      app.render();
    } catch (e) {
      status.textContent = e?.message || 'That PDF couldn’t be read.';
      status.classList.add('is-error');
      choose.disabled = false;
    }
  });
  const link = h('a', { href: LFF_URL, target: '_blank', rel: 'noopener' }, 'Download the PDF from the Episcopal Church');

  if (lff.data) {
    return card('Lesser Feasts and Fasts',
      h('p', null, h('strong', null, lff.data.title), `: ${lff.data.feasts.length} lesser feasts, each with its collect in Rite One and Rite Two.`),
      toggle({
        label: 'Keep the lesser feasts',
        hint: 'On a day with none of the Prayer Book’s own, a lesser feast names the day, and its collect is the Collect of the Day, with the Prayer Book’s as the other choice. They give way to Sundays, Principal Feasts and Holy Days, Ash Wednesday, and Holy Week and Easter Week; when they’re displaced, they aren’t kept that year.',
        checked: s.lesserFeasts !== false,
        onChange: (v) => store.setSetting('lesserFeasts', v),
      }),
      h('div', { class: 'button-row' },
        choose,
        h('button', {
          class: 'btn btn-sm',
          type: 'button',
          onclick: async () => {
            const ok = await confirmSheet({
              title: 'Remove Lesser Feasts and Fasts?',
              message: app.sync?.enabled ? 'It will be taken off this device and your other synced devices. You can load the PDF again at any time.' : 'It will be taken off this device. You can load the PDF again at any time.',
              confirm: 'Remove',
            });
            if (!ok) return;
            app.setLff(null);
            toast('Lesser Feasts and Fasts removed');
          },
        }, 'Remove')),
      status, input);
  }
  const elsewhere = current && !current.removed;
  return card('Lesser Feasts and Fasts',
    h('p', null, 'Add the lesser feasts to the calendar, each with its collect in Rite One or Rite Two, from your own copy of the book.'),
    elsewhere && h('p', { class: 'hint' }, `${current.title || 'Lesser Feasts and Fasts'} was loaded on another of your devices${app.sync?.enabled ? ', and will come here with the next sync' : ''}. You can also load it here.`),
    h('ol', { class: 'steps' },
      h('li', null, link, ' (Lesser Feasts and Fasts 2024, free). On iPhone, open it, tap Share, then Save to Files.'),
      h('li', null, 'Choose it here. It’s read on this device, which takes a moment.')),
    h('div', { class: 'button-row' }, choose),
    status, input,
    h('p', { class: 'hint' }, 'The book is under copyright, so it isn’t built into the app: its collects stay on your devices and, if you sync, in your private repository.'));
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
      h('p', { class: 'hint' }, `Church year colours the app by the liturgical day: now ${dayTitle(app.today).color} (${dayTitle(app.today).title}). The ribbon on Today always shows the day’s colour.`),
      field('Theme', chipGroup({
        label: 'Theme',
        value: s.theme,
        options: [{ value: 'auto', label: 'Match device' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }],
        onChange: (v) => store.setSetting('theme', v),
      }))),

    card('Prayers',
      field('Language', chipGroup({
        label: 'Language of the prayers',
        className: 'chips-rite',
        value: s.rite || DEFAULT_RITE,
        options: RITES.map((r) => ({ value: r.value, label: r.label })),
        onChange: (v) => store.setSetting('rite', v),
      })),
      h('p', { class: 'hint' }, 'Rite One is traditional language, Rite Two contemporary. The Collect of the Day is as the Prayer Book prints it in each. In Rite Two, prayers it gives only in traditional language say you and your, with their verbs to match: for most, the words it prints in italics; for the few classical ones it leaves unmarked, such as All Sorts and Conditions, the same words throughout.'),
      toggle({
        label: 'Show the Collect of the Day',
        hint: 'On Today, and first in pray-through. On a weekday it’s the one the Prayer Book appoints: the Sunday’s, as a rule, or a Holy Day’s own.',
        checked: s.showCollect !== false,
        onChange: (v) => store.setSetting('showCollect', v),
      }),
      toggle({
        label: 'Show each list’s prayers',
        hint: 'Prayers from the Prayer Book open each list on Today and in pray-through. To change them, open the list and tap ⋯.',
        checked: s.showPrayers !== false,
        onChange: (v) => store.setSetting('showPrayers', v),
      }),
      h('div', { class: 'button-row' },
        h('button', { class: 'btn btn-sm', type: 'button', onclick: () => openPrayerPicker(app) }, icon('plus'), 'Choose prayers and thanksgivings')),
      h('p', { class: 'hint' }, 'Any of the Prayer Book’s Prayers and Thanksgivings, to pray one by one each day.')),

    lffCard(app),

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
          const book = app.lff?.data;
          store.eraseAll();
          app.lff?.clear();
          for (const seed of SEEDS) store.seed(seed); // as on a first run
          toast('Erased', {
            action: 'Undo',
            onAction: () => {
              if (book) app.lff.save(book);
              store.restore(snap);
            },
          });
        },
      }, icon('trash'), 'Erase all data')),
  ];
}
