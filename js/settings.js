// Settings: appearance, cycle options, backup/restore, install help.

import { h, icon, toast, toggle, chipGroup, confirmSheet } from './ui.js';
import { todayKey, formatWithYear } from './dates.js';
import { season } from './liturgy.js';
import { VERSION } from './version.js';

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
      toggle({
        label: 'Colours of the church year',
        hint: `The accent colour follows the liturgical season. Now: ${season(app.today).name}.`,
        checked: s.seasonalColor,
        onChange: (v) => store.setSetting('seasonalColor', v),
      }),
      field('Theme', chipGroup({
        label: 'Theme',
        value: s.theme,
        options: [{ value: 'auto', label: 'Match device' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }],
        onChange: (v) => store.setSetting('theme', v),
      }))),

    card('Monthly cycles',
      toggle({
        label: 'Catch up in shorter months',
        hint: 'On the last day of a short month, also pray for the days it doesn’t have. February 28 shows days 28–31, so no church is missed.',
        checked: s.foldShortMonths !== false,
        onChange: (v) => store.setSetting('foldShortMonths', v),
      })),

    card('Backup',
      h('p', null, 'Your lists are kept only on this device. Save a backup now and then, and before you change phones.'),
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
            message: 'All lists, names and check-offs on this device will be deleted. Save a backup first if you might want them back.',
            confirm: 'Erase',
            danger: true,
          });
          if (!ok) return;
          const snap = store.snapshot();
          store.eraseAll();
          toast('Erased', { action: 'Undo', onAction: () => store.restore(snap) });
        },
      }, icon('trash'), 'Erase all data')),
  ];
}
