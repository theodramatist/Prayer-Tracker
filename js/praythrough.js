// Pray-through: a quiet full-screen view of today's list, one entry at a time.
// Each list opens with its prayer; "Amen" marks an entry prayed and moves on.

import { h, icon, replace } from './ui.js';
import { dayModel, pendingEntries } from './today.js';
import { prayerFor } from './prayers.js';
import { formatMedium } from './dates.js';

export function openPrayThrough(app) {
  const { store } = app;
  const model = dayModel(app);
  const withPrayers = store.state.settings.showPrayers !== false;
  const cards = [];
  for (const { group, entries } of pendingEntries(model)) {
    const prayer = withPrayers ? prayerFor(group.list) : null;
    if (prayer) cards.push({ kind: 'prayer', group, prayer });
    for (const e of entries) cards.push({ kind: 'entry', group, ...e, prayed: false });
  }
  cards.push({ kind: 'end' });
  const entryCards = cards.filter((c) => c.kind === 'entry');
  let index = 0;

  const stage = h('div', { class: 'pray-stage', 'aria-live': 'polite' });
  const counter = h('span', { class: 'pray-count' });
  const actions = h('div', { class: 'pray-actions' });
  const dlg = h('dialog', { class: 'pray', 'aria-label': 'Pray through the list' },
    h('header', { class: 'pray-top' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => close() }, icon('x')),
      counter,
      h('span', { class: 'pray-top-spacer' })),
    stage,
    actions);

  function eyebrow(group) {
    return [group.list.name, group.label].filter(Boolean).join(' · ');
  }

  function render() {
    const card = cards[index];
    const n = entryCards.indexOf(card);
    counter.textContent = card.kind === 'entry' ? `${n + 1} of ${entryCards.length}` : card.kind === 'end' ? '' : `${entryCards.length} to pray`;
    let body;
    if (card.kind === 'prayer') {
      body = h('div', { class: 'pray-card pray-prayer' },
        h('p', { class: 'pray-eyebrow' }, eyebrow(card.group)),
        h('h2', { class: 'pray-prayer-title' }, card.prayer.title),
        h('p', { class: 'pray-prayer-text' }, card.prayer.text));
    } else if (card.kind === 'entry') {
      body = h('div', { class: `pray-card pray-entry ${card.prayed ? 'is-prayed' : ''}` },
        h('p', { class: 'pray-eyebrow' }, eyebrow(card.group)),
        h('h2', { class: `pray-name ${card.item.text.length > 40 ? 'long' : ''}` }, card.item.text),
        card.item.note && h('p', { class: 'pray-note' }, card.item.note),
        card.carried && h('p', { class: 'pray-from' }, `From ${formatMedium(card.date)}`),
        card.prayed && h('p', { class: 'pray-done' }, icon('check'), 'Prayed'));
    } else {
      const prayed = entryCards.filter((c) => c.prayed).length;
      body = h('div', { class: 'pray-card pray-end' },
        h('span', { class: 'ornament', 'aria-hidden': 'true' }, '✠'),
        h('p', { class: 'pray-response' }, 'Thanks be to God.'),
        h('p', { class: 'pray-summary' }, prayed === entryCards.length
          ? 'Everyone on today’s list has been prayed for.'
          : `${prayed} of ${entryCards.length} prayed for. The rest are still on Today.`));
    }
    replace(stage, body);
    body.classList.add('enter');

    const back = h('button', { class: 'btn btn-quiet', type: 'button', disabled: index === 0, onclick: () => go(-1) }, icon('left'), 'Back');
    if (card.kind === 'end') {
      replace(actions, back, h('button', { class: 'btn btn-primary btn-amen', type: 'button', onclick: () => close() }, 'Close'));
    } else if (card.kind === 'entry' && card.prayed) {
      replace(actions, back,
        h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => unmark(card) }, 'Unmark'),
        h('button', { class: 'btn btn-primary btn-amen', type: 'button', onclick: () => go(1) }, 'Next', icon('right')));
    } else {
      replace(actions, back,
        card.kind === 'entry' && h('button', { class: 'btn btn-quiet', type: 'button', onclick: () => go(1) }, 'Skip'),
        h('button', { class: 'btn btn-primary btn-amen', type: 'button', onclick: () => amen() }, 'Amen'));
    }
    actions.querySelector('.btn-amen')?.focus({ preventScroll: true });
  }

  function go(delta) {
    index = Math.max(0, Math.min(cards.length - 1, index + delta));
    render();
  }

  function amen() {
    const card = cards[index];
    if (card.kind === 'entry' && !card.prayed) {
      store.setChecked(card.date, card.item.id, true, { silent: true });
      card.prayed = true;
    }
    go(1);
  }

  function unmark(card) {
    store.setChecked(card.date, card.item.id, false, { silent: true });
    card.prayed = false;
    render();
  }

  function close() {
    dlg.classList.add('closing');
    setTimeout(() => { if (dlg.open) dlg.close(); dlg.remove(); app.render(); }, 160);
  }

  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  });
  // Swipe left for the next card, right for the previous one.
  let startX = null;
  stage.addEventListener('pointerdown', (e) => { startX = e.clientX; });
  stage.addEventListener('pointerup', (e) => {
    if (startX == null) return;
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
  });

  document.body.append(dlg);
  dlg.showModal();
  render();
  return { el: dlg, close };
}
