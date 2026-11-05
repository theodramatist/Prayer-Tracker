// The full edition's own Settings cards: Lesser Feasts and Fasts (from your
// own copy of the book), Sharing with Trinity, and Sync across devices. The
// public edition has a stand-in for this module (edition/public/extras.js).

import { h, icon, toast, toggle, confirmSheet } from './ui.js';
import { todayKey, formatWithYear } from './dates.js';
import { LFF_URL, readLffPdf } from './lff.js';
import { shareCard } from './share-ui.js';

const field = (label, ...children) => h('div', { class: 'field' }, h('span', { class: 'field-label' }, label), children);
const card = (title, ...children) => h('section', { class: 'settings-card' }, h('h2', null, title), children);

/** The cards, in the order they come after Prayers. */
export function extraCards(app) {
  return [lffCard(app), shareCard(app), syncCard(app)];
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
