// Sharing a prayer request with Trinity's prayer list through the parish's
// Google Form, "Trinity Prayer Requests". The answers are sent the way the
// form's own page sends them.
//
// Each request to share waits a few seconds in an outbox on this device (so
// Undo can still stop it), then goes. Google doesn't tell another site whether
// it recorded a response, so a send that reaches Google counts as sent; one
// that can't get through (offline) stays in the outbox and goes when the
// connection is back.

import { todayKey } from './dates.js';
import { uid } from './store.js';

const FORM = 'https://docs.google.com/forms/d/e/1FAIpQLSceBPekpqOMedX0hZYr27AjsuaDFwjs0W_eftoAQvaK197Q3Q';

export const TRINITY_FORM = {
  id: 'trinity',
  name: 'Trinity',
  title: 'Trinity Prayer Requests',
  send: `${FORM}/formResponse`,
  view: `${FORM}/viewform`,
  // The form's questions, by the codes Google gives their answers.
  entries: {
    name: 'entry.597871476', // What's your name (first and last)?
    request: 'entry.670633233', // How can we pray for you?
    died: 'entry.764039509', // Is this a prayer request for someone who has died? (No / Yes)
    sharing: 'entry.1294983933', // Who would you like your prayer request shared with?
  },
  // The sharing choices, word for word as the form has them.
  sharing: [
    'Only share my name and prayer request with clergy and staff.',
    'Share my prayer request with members of the congregation, but keep my name anonymous.',
    'Share my prayer request and name with members of the congregation.',
  ],
};

export const FORMS = { [TRINITY_FORM.id]: TRINITY_FORM };

/** The answers as the form posts them. */
export function formFields(form, answers) {
  const e = form.entries;
  return new URLSearchParams([
    [e.name, String(answers.name || '').trim()],
    [e.request, String(answers.request || '').trim()],
    [e.died, answers.died ? 'Yes' : 'No'],
    [e.sharing, answers.sharing],
  ]);
}

/** The form itself with these answers filled in, to check and submit there. */
export function prefilledUrl(form, answers) {
  return `${form.view}?usp=pp_url&${formFields(form, answers).toString()}`;
}

/** What's still needed before the answers can go: [] when they're complete. */
export function missingAnswers(form, answers) {
  const missing = [];
  if (!String(answers?.name || '').trim()) missing.push('name');
  if (!String(answers?.request || '').trim()) missing.push('request');
  if (!form.sharing.includes(answers?.sharing)) missing.push('sharing');
  return missing;
}

/** Post one response. Resolves once it has reached Google; rejects if it can't get through. */
export async function sendResponse(form, answers, fetchImpl = globalThis.fetch.bind(globalThis)) {
  await fetchImpl(form.send, { method: 'POST', mode: 'no-cors', body: formFields(form, answers) });
}

/** Put a request in the outbox for `form`, for the entries it came from. Returns the job's id. */
export function queueShare(store, { form = TRINITY_FORM, itemIds = [], answers }) {
  const job = { id: uid(), form: form.id, itemIds, answers: { ...answers }, at: store.clock() };
  store.setMeta('outbox', [...(store.state.meta.outbox || []), job]);
  return job.id;
}

/** Take a request back out of the outbox before it goes (Undo). */
export function cancelShare(store, jobId) {
  const outbox = store.state.meta.outbox || [];
  if (outbox.some((j) => j.id === jobId)) store.setMeta('outbox', outbox.filter((j) => j.id !== jobId));
}

export const pendingShares = (store) => store.state.meta.outbox || [];

let flushing = null;

/**
 * Send what's in the outbox. Each request that gets through is taken out and
 * its entries are marked shared (Trinity can then be asked again in a month).
 * A request whose entries have all been deleted is dropped unsent. `minAge`
 * leaves alone anything queued more recently, while it can still be undone.
 * Resolves to { sent, waiting }.
 */
export function flushOutbox(store, { fetchImpl, minAge = 0 } = {}) {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    for (const job of [...pendingShares(store)]) {
      if (store.clock() - job.at < minAge) continue;
      const form = FORMS[job.form];
      const items = job.itemIds.map((id) => store.findItem(id)).filter(Boolean);
      const stillThere = pendingShares(store).some((j) => j.id === job.id);
      if (!stillThere) continue;
      if (!form || (job.itemIds.length && !items.length)) {
        cancelShare(store, job.id);
        continue;
      }
      try {
        await sendResponse(form, job.answers, fetchImpl);
      } catch {
        continue; // offline or unreachable: try again later
      }
      cancelShare(store, job.id);
      const day = todayKey(new Date(store.clock()));
      for (const id of job.itemIds) store.markShared(id, form.id, day);
      sent += 1;
    }
    return { sent, waiting: pendingShares(store).length };
  })().finally(() => { flushing = null; });
  return flushing;
}
