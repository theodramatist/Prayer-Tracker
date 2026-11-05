// Settings: appearance, cycle options, backup/restore, install help.

import { h, icon, toast, toggle, chipGroup, confirmSheet } from './ui.js';
import { todayKey, formatWithYear } from './dates.js';
import { dayTitle } from './calendar.js';
import { VERSION } from './version.js';
import { SEEDS } from './seeds.js';
import { RITES, DEFAULT_RITE } from './prayers.js';
import { openPrayerPicker } from './sheets.js';
import { extraCards } from './extras.js';
import { EDITION } from './edition.js';

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
      h('p', { class: android ? 'install-here' : '' }, h('strong', null, 'Android: '), 'in Chrome, tap ⋮ then Install app (or Add to Home screen).'),
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
        hint: 'Prayers from the Prayer Book open each list on Today and in pray-through. To change them, open the list and tap ⋯.',
        checked: s.showPrayers !== false,
        onChange: (v) => store.setSetting('showPrayers', v),
      }),
      h('div', { class: 'button-row' },
        h('button', { class: 'btn btn-sm', type: 'button', onclick: () => openPrayerPicker(app) }, icon('plus'), 'Choose prayers and thanksgivings')),
      h('p', { class: 'hint' }, 'Any of the Prayer Book’s Prayers and Thanksgivings, to pray one by one each day.')),

    // The full edition's own cards (see extras.js).
    ...extraCards(app),

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
      h('p', null, `Prayer Tracker ${VERSION}. ${EDITION.privacy}`),
      h('p', { class: 'hint' }, 'The prayers and collects are from the Book of Common Prayer (1979), which is in the public domain. The Anglican Cycle of Prayer is © the Anglican Consultative Council and is shared free of charge under its terms.'),
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
