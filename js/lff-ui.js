// Settings → Lesser Feasts and Fasts: load the book from your own copy of the
// PDF (read on the device; see lff.js), turn the lesser feasts off and on, or
// remove it. In both editions.

import { h, icon, toast, toggle, confirmSheet } from './ui.js';
import { LFF_URL, readLffPdf } from './lff.js';
import { SYNC_AVAILABLE } from './sync.js';

const card = (title, ...children) => h('section', { class: 'settings-card' }, h('h2', null, title), children);

/**
 * Lesser Feasts and Fasts, from your own copy of the PDF: read on this
 * device, kept here, and passed to your other devices only by your own sync.
 */
export function lffCard(app) {
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
    h('p', { class: 'hint' }, SYNC_AVAILABLE
      ? 'The book is under copyright, so it isn’t built into the app: its collects stay on your devices and, if you sync, in your private repository.'
      : 'The book is under copyright, so it isn’t built into the app: its collects stay on this device, and in your backups.'));
}
