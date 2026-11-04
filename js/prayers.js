// Prayers from the Book of Common Prayer: the Prayers and Thanksgivings
// (data/prayers.js, built from the Prayer Book's text), and a prayer from the
// Great Vigil of Easter. Each list opens with one or more of them, which can be
// changed, reworded, or replaced with your own (Lists → a list → ⋯ → Prayers);
// any of them can also be prayed one by one in "Prayers and Thanksgivings".
//
// The Prayer Book keeps prayers written in traditional idiom as they are, but
// prints their pronouns and verbs in italics "to assist in rendering them into
// contemporary speech". Those prayers come in both forms here (Rite One and
// Rite Two language, chosen in Settings), and so do the few "classical" ones
// it leaves unmarked, rendered the same way (you and your, and their verbs).
// Prayers already in contemporary language have just the one form.

import bcp from './data/prayers.js';

export const SOURCE = 'The Book of Common Prayer';

/** Rite One: traditional language. Rite Two: contemporary. */
export const RITES = [
  { value: 'traditional', label: 'Rite One', blurb: 'traditional language' },
  { value: 'contemporary', label: 'Rite Two', blurb: 'contemporary language' },
];
export const DEFAULT_RITE = 'contemporary';

const VIGIL = {
  id: 'vigil',
  kind: 'prayer',
  section: 'From the Great Vigil of Easter',
  title: 'From the Great Vigil of Easter',
  text: 'God and Father of all believers, for the glory of your Name multiply, by the grace of the Paschal sacrament, the number of your children; that your Church may rejoice to see fulfilled your promise to our father Abraham; through Jesus Christ our Lord. Amen.',
};

/** Every prayer by id: "p1"…"p70" and "t1"…"t11" as numbered in the Prayer Book, and "vigil". */
export const PRAYERS = Object.fromEntries([...bcp.prayers, VIGIL].map((p) => [p.id, p]));

/** The names earlier versions of the app gave the prayers it had. */
const ALIASES = {
  church: 'p7', unity: 'p14', mission: 'p8', diocese: 'p10', parish: 'p11', clergy: 'p9',
  conditions: 'p2', loved: 'p54', absent: 'p52', trouble: 'p55', human: 'p3',
};

export const prayerById = (key) => PRAYERS[ALIASES[key] || key] || null;

/** The Prayer Book's headings, in order, each with its prayers. */
export const SECTIONS = (() => {
  const out = [];
  for (const p of Object.values(PRAYERS)) {
    let s = out.find((x) => x.title === p.section && x.kind === p.kind);
    if (!s) out.push((s = { title: p.section, kind: p.kind, prayers: [] }));
    s.prayers.push(p);
  }
  return out;
})();

/** A prayer's words in the chosen language, where it has both. */
export function prayerText(p, rite = DEFAULT_RITE) {
  if (!p) return '';
  if (p.text != null) return p.text;
  return rite === 'traditional' ? p.traditional : p.contemporary;
}

/** True for a prayer that can be said in both Rite One and Rite Two language. */
export const hasBothForms = (p) => !!(p && p.traditional && p.contemporary);

/** True for a classical prayer whose contemporary wording is the app's, not marked in the Prayer Book. */
export const renderedByApp = (p) => p?.rendered === 'app';

/** Its first words, for a one-line summary. */
export function firstWords(text, n = 12) {
  const first = String(text || '').split('\n')[0].replace(/\*/g, '');
  const words = first.split(/\s+/);
  return words.length > n ? `${words.slice(0, n).join(' ')}…` : first;
}

/** Which prayers each of the starting lists opens with. */
export const DEFAULT_PRAYERS = {
  anglican: ['p7'],
  diocese: ['p10'],
  'diocese-daily': ['p9'],
  trinity: ['p11'],
  requests: ['vigil', 'p2'],
  family: ['p54'],
  clergy: ['p9'],
};

function resolve(spec, rite) {
  if (!spec) return null;
  const base = spec.key ? prayerById(spec.key) : null;
  if (base && spec.text == null) return { key: base.id, title: base.title, text: prayerText(base, rite), both: hasBothForms(base) };
  if (spec.text && String(spec.text).trim()) return { key: base?.id || null, title: spec.title || 'Prayer', text: spec.text, own: true };
  return null;
}

/**
 * The prayers a list opens with, in order: [{ title, text, key?, own? }].
 * list.prayer is undefined for the list's usual prayers, null for none, or one
 * prayer or an array of them, each { key } for a Prayer Book prayer as it
 * stands, or { title, text, key? } for your own words.
 */
export function prayersFor(list, rite = DEFAULT_RITE) {
  const p = list.prayer;
  if (p === null) return [];
  const specs = p === undefined ? (DEFAULT_PRAYERS[list.id] || []).map((key) => ({ key })) : Array.isArray(p) ? p : [p];
  return specs.map((s) => resolve(s, rite)).filter(Boolean);
}

/** The prayer an entry of "Prayers and Thanksgivings" stands for: { title, text } or null. */
export function itemPrayer(item, rite = DEFAULT_RITE) {
  if (item.prayer) {
    const p = prayerById(item.prayer);
    return p ? { key: p.id, title: p.title, text: prayerText(p, rite), both: hasBothForms(p) } : { title: item.text, text: '' };
  }
  if (item.prayerText) return { title: item.text, text: item.prayerText, own: true };
  return null;
}

export const isPrayerItem = (item) => !!(item && (item.prayer || item.prayerText));
