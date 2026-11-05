// Sharing a prayer request with Trinity's prayer list, on screen: the switch
// and questions in the add sheet, the share sheet for an entry already on a
// list, the Settings card for the name requests go under, and sending what's
// waiting. The form itself, and the outbox, are in share.js. The public
// edition has a stand-in for this module (edition/public/share-ui.js) and
// leaves share.js out.

import { h, icon, openSheet, toast, chipGroup, toggle } from './ui.js';
import { formatMedium, formatWithYear } from './dates.js';
import { TRINITY_FORM, prefilledUrl, queueShare, cancelShare, flushOutbox, pendingShares, shareName, sharingChoice } from './share.js';

const field = (label, ...children) => h('div', { class: 'field' }, label && h('span', { class: 'field-label' }, label), children);
const card = (title, ...children) => h('section', { class: 'settings-card' }, h('h2', null, title), children);

/** Lists whose entries can be shared with Trinity's prayer list: your own daily ones. */
export const canShare = (list) => list?.type === 'daily';

/**
 * Trinity's prayer request form, under a "Share with Trinity" switch (unless
 * `fixed`). Your name comes from Settings and the request is the entry as you
 * wrote it, so only the form's other two questions are asked here. The
 * sharing choice is remembered for next time.
 */
export function shareFields(app, { fixed = false, preview = null } = {}) {
  const { store } = app;
  const form = TRINITY_FORM;
  let on = fixed;
  let died = false;
  let sharing = sharingChoice(store);
  const group = `share-${Math.random().toString(36).slice(2, 8)}`;
  const choices = h('div', { class: 'radio-list', role: 'radiogroup', 'aria-label': 'Who would you like your prayer request shared with?' },
    form.sharing.map((choice) => h('label', { class: 'radio-row' },
      h('input', { type: 'radio', name: group, value: choice, checked: choice === sharing, onchange: () => { sharing = choice; } }),
      h('span', null, choice))));
  const answers = (request) => ({ name: shareName(store), request, died, sharing });

  const body = h('div', { class: 'share-body', hidden: !on },
    h('p', { class: 'hint share-from' }, `From ${shareName(store)}, with the request as you wrote it${fixed ? '' : ' above'}. Details stay private.`),
    preview && h('blockquote', { class: 'share-preview' }, preview),
    field('Is this a prayer request for someone who has died?', chipGroup({
      label: 'Is this a prayer request for someone who has died?',
      value: 'no',
      options: [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }],
      onChange: (v) => { died = v === 'yes'; },
    })),
    field('Who would you like your prayer request shared with?', choices),
    h('p', { class: 'hint' }, 'Trinity prays for a request for one month. For an ongoing one, share it again each month: tap it, then Share with Trinity again.'),
    fixed && preview && h('a', {
      class: 'link-btn share-open',
      href: form.view,
      target: '_blank',
      rel: 'noopener',
      onclick: (e) => { e.currentTarget.href = prefilledUrl(form, answers(preview)); },
    }, icon('link'), 'Or open the form itself, filled in'));

  let onToggle = null;
  const toggleRow = !fixed && toggle({
    label: 'Share with Trinity',
    hint: 'Also send this request to Trinity’s prayer list.',
    checked: false,
    onChange: (v) => {
      on = v;
      body.hidden = !v;
      onToggle?.(v);
    },
  });

  return {
    el: h('div', { class: 'share' }, toggleRow, body),
    get on() { return on; },
    set onToggle(fn) { onToggle = fn; },
    /** The form's answers for one request. */
    answers,
    /** Remember the sharing choice for next time. */
    remember() {
      const prev = store.state.settings.share?.[form.id] || {};
      if (prev.sharing !== sharing) store.setSetting('share', { ...(store.state.settings.share || {}), [form.id]: { ...prev, sharing } });
    },
  };
}

/** Send what's waiting once the Undo moment has passed, and say how it went. */
export function sendSharesSoon(app) {
  setTimeout(async () => {
    const { sent, waiting } = await flushOutbox(app.store);
    if (sent) toast(sent === 1 ? 'Sent to Trinity’s prayer list' : `Sent ${sent} requests to Trinity’s prayer list`);
    else if (waiting) toast('No connection yet. It will go to Trinity when you’re back online.');
  }, app.shareDelay ?? 5500);
}

/** Share an entry already on a list with Trinity (again, for an ongoing request). */
export function openShareSheet(app, itemId) {
  const { store } = app;
  const found = store.findItem(itemId);
  if (!found) return null;
  const { item } = found;
  const share = shareFields(app, { fixed: true, preview: item.text });
  const last = item.shared?.[TRINITY_FORM.id];
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, last ? 'Send to Trinity again' : 'Send to Trinity');
  const form = h('form', { class: 'share-form', novalidate: true },
    h('p', { class: 'sheet-text' }, last
      ? `Shared with Trinity on ${formatWithYear(last)}. Trinity prays for a request for a month, so send it again to keep it on their list.`
      : 'Sends this request to Trinity’s prayer list through the parish’s prayer request form.'),
    share.el,
    h('div', { class: 'sheet-actions' }, submit));
  let sheet;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    share.remember();
    const job = queueShare(store, { itemIds: [item.id], answers: share.answers(item.text) });
    sheet.close();
    toast('Sending to Trinity in a moment', { action: 'Undo', onAction: () => cancelShare(store, job) });
    sendSharesSoon(app);
  });
  sheet = openSheet({ title: 'Share with Trinity', className: 'sheet-share', content: form });
  return sheet;
}

/** Queue each new entry as its own request, worded as you wrote it. Returns the jobs, for Undo. */
export function queueShares(app, share, items) {
  share.remember();
  return items.map((i) => queueShare(app.store, { itemIds: [i.id], answers: share.answers(i.text) }));
}

export function cancelShares(app, jobs) {
  for (const job of jobs) cancelShare(app.store, job);
}

/** What the "Added" message adds when requests are on their way. */
export const sharingNote = (jobs) => (jobs.length ? '. Sharing with Trinity…' : '');

/** When an entry was last shared, for its details. */
export function sharedNote(item) {
  const on = item.shared?.[TRINITY_FORM.id];
  return on ? `shared with Trinity ${formatMedium(on)}` : null;
}

/** The button in an entry's sheet. */
export function shareButton(app, item, closeSheet) {
  const on = item.shared?.[TRINITY_FORM.id];
  return h('button', {
    class: 'link-btn',
    type: 'button',
    onclick: () => { closeSheet(); openShareSheet(app, item.id); },
  }, icon('upload'), on ? 'Share with Trinity again' : 'Share with Trinity');
}

/**
 * Prayer requests waiting to go to Trinity (shared while offline, say): sent
 * on opening, when the connection returns, and when the app comes back to the
 * front, but never while one can still be undone.
 */
export function startSharing(app) {
  const { store } = app;
  const sendWaiting = async () => {
    if (document.hidden || !pendingShares(store).length) return;
    const { sent } = await flushOutbox(store, { minAge: app.shareDelay ?? 5000 });
    if (sent) toast(sent === 1 ? 'Sent a waiting request to Trinity’s prayer list' : `Sent ${sent} waiting requests to Trinity’s prayer list`);
  };
  document.addEventListener('visibilitychange', sendWaiting);
  window.addEventListener('online', sendWaiting);
  setTimeout(sendWaiting, 3000);
  return sendWaiting;
}

/** Sharing requests with Trinity: the name they're sent under. */
export function shareCard(app) {
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
