// The full edition's own Settings cards: Lesser Feasts and Fasts (from your
// own copy of the book), Sharing with Trinity, and Sync across devices. The
// public edition has a stand-in for this module (edition/public/extras.js),
// with only the first.

import { h, toast, confirmSheet } from './ui.js';
import { todayKey, formatWithYear } from './dates.js';
import { lffCard } from './lff-ui.js';
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
