// Lesser Feasts and Fasts: the Episcopal Church's lesser feasts and their
// collects, in Rite One and Rite Two.
//
// The book is under copyright, so its text isn't part of the app: you load
// your own copy of the PDF (the Episcopal Church publishes it free) and the
// app reads it on your device and keeps what it needs there (in the full
// edition, copying it to your other devices only through your own private
// sync repository).
//
// The lesser feasts are days of optional observance, kept "subject to the
// rules of precedence governing Principal Feasts, Sundays, and Holy Days" (the
// Calendar of the Church Year, BCP page 18, reprinted in the book). So one is
// kept only on a day with no observance of its own: not on a Sunday, a
// Principal Feast or a Holy Day (including one moved to that day), Ash
// Wednesday, or the days of Holy Week and Easter Week. The rules make no
// provision for moving a lesser feast, so in a year it is displaced it is
// simply not kept.

import { observance } from './calendar.js';
import { EDITION } from './edition.js';

export const LFF_AVAILABLE = true;

/** The Episcopal Church's own PDF of the current edition. */
export const LFF_URL = 'https://www.episcopalchurch.org/wp-content/uploads/2025/03/lesser_feasts_and_fasts_-_2024__final_.pdf';
export const LFF_KEY = `${EDITION.storage}:lff`;

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH = new RegExp(`(${MONTHS.join('|')})(?: (\\d{1,2}))?`);
const pad = (n) => String(n).padStart(2, '0');

// The Holy Days and Principal Feasts on fixed dates (see calendar.js). The book
// gives their Propers too, but the app takes those from the Prayer Book, and a
// lesser feast is never kept on one of these dates.
const MAJOR_DATES = new Set(['01-01', '01-06', '01-18', '01-25', '02-02', '02-24', '03-19', '03-25', '04-25', '05-01', '05-31',
  '06-11', '06-24', '06-29', '07-04', '07-22', '07-25', '08-06', '08-15', '08-24', '09-14', '09-21', '09-29', '10-18',
  '10-23', '10-28', '11-01', '11-30', '12-21', '12-25', '12-26', '12-27', '12-28']);

/** A name in plain letters, for comparing a Proper's heading with the Calendar's line. */
export const plain = (s) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[‘’'`ʻ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Group one page's text items from pdf.js into lines, top to bottom as the
 * page gives them: { page, y, size, text }.
 */
export function linesOf(items, page) {
  const lines = [];
  let cur = null;
  for (const it of items) {
    if (typeof it.str !== 'string' || !it.str) continue;
    const y = it.transform[5];
    const size = Math.round(Math.abs(it.transform[3]));
    if (!cur || Math.abs(cur.y - y) > 3) {
      cur = { page, y, size: 0, parts: [] };
      lines.push(cur);
    }
    if (it.str.trim() && !cur.size) cur.size = size;
    cur.parts.push(it.str);
  }
  return lines.map(({ parts, ...l }) => ({ ...l, text: parts.join('').replace(/\s+/g, ' ').trim() })).filter((l) => l.text);
}

/** Join a line onto text: with a space, or straight on after a hyphen ("all-encompassing", "God-bearer"). */
const join = (text, line) => (!text ? line : text.endsWith('-') ? text + line : `${text} ${line}`);

/**
 * Read the book: its edition and, for each lesser feast, its date (MM-DD),
 * heading, the line beneath it, its page, and its collect in each language.
 * `lines` are every page's lines in order (see linesOf). Throws if this
 * isn't Lesser Feasts and Fasts.
 */
export function parseLff(lines) {
  const front = lines.filter((l) => l.page <= 8).map((l) => l.text).join(' ');
  const edition = front.match(/Lesser Feasts\s+and Fasts\s*[•·-]?\s*(\d{4})/)?.[1];
  if (!edition) throw new Error('This doesn’t look like Lesser Feasts and Fasts.');

  // The Calendar: each month's days, with any line that runs on.
  const calendar = [];
  let month = null;
  let started = false;
  for (const l of lines) {
    if (l.y < 80 && l.size <= 11) continue; // the running head
    if (l.size >= 30 && /^The Proper for/.test(l.text)) break;
    if (l.size === 12 && MONTHS.includes(l.text)) { month = MONTHS.indexOf(l.text) + 1; started = true; continue; }
    if (!started || l.size !== 10) continue;
    const m = l.text.match(/^(\d{1,2})(?:\s+(.*))?$/);
    if (m) calendar.push({ date: `${pad(month)}-${pad(m[1])}`, text: m[2] || '' });
    else if (calendar.length) calendar[calendar.length - 1].text = join(calendar[calendar.length - 1].text, l.text);
  }
  // A day can have two commemorations on its line, one of them for trial use in [brackets].
  const onCalendar = [];
  for (const c of calendar) {
    for (const m of c.text.matchAll(/\[([^\]]*)\]/g)) onCalendar.push({ date: c.date, text: m[1].trim(), trial: true });
    const rest = c.text.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
    if (rest) onCalendar.push({ date: c.date, text: rest, trial: false });
  }

  // The Propers: a heading, the line beneath it, then the collect in traditional (I) and contemporary (II) language.
  const propers = [];
  let cur = null;
  let rite = null;
  // Each page's number and the date of its Proper, from the running head at its foot.
  const heads = new Map();
  for (const x of lines) {
    if (x.y >= 80) continue;
    const h = heads.get(x.page) || { pageNo: null, date: null };
    const n = x.text.match(/^(\d+)/);
    if (n) h.pageNo = Number(n[1]);
    const d = x.text.match(MONTH);
    if (d) h.date = d[2] ? `${pad(MONTHS.indexOf(d[1]) + 1)}-${pad(d[2])}` : 'movable';
    heads.set(x.page, h);
  }
  let inProper = false;
  for (const l of lines) {
    const { pageNo = null, date = null } = heads.get(l.page) || {};
    if (l.y < 80) continue;
    if (l.size >= 30) {
      if (/^The Proper for/.test(l.text)) inProper = true;
      if (/^The Commons?\b/.test(l.text)) inProper = false;
      continue;
    }
    if (!inProper) continue;
    if (l.size >= 16) {
      if (/^Concerning\b/.test(l.text) || /^the Lesser Feasts$/.test(l.text)) { cur = null; continue; }
      // A heading can run over several lines, and name several people, each
      // with the line that describes them beneath: until the collect begins,
      // it is all one heading.
      if (cur && !cur.traditional && !cur.contemporary && cur.page === pageNo) {
        cur.names.push(l.text);
      } else {
        cur = { names: [l.text], subs: [], page: pageNo, date, traditional: '', contemporary: '' };
        propers.push(cur);
      }
      rite = null;
      continue;
    }
    if (!cur) continue;
    if (l.size === 11) {
      const m = l.text.match(/^(II|I)\s+(.*)$/);
      if (m && !cur[m[1] === 'I' ? 'traditional' : 'contemporary']) {
        rite = m[1] === 'I' ? 'traditional' : 'contemporary';
        cur[rite] = m[2];
      } else if (rite && !/Amen\.?$/.test(cur[rite])) {
        cur[rite] = join(cur[rite], l.text);
      }
      continue;
    }
    if (l.size <= 10 && !rite && !cur.traditional) {
      // The description under a name, which may itself run over two lines.
      if (cur.subs.length === cur.names.length) cur.subs[cur.subs.length - 1] = join(cur.subs[cur.subs.length - 1], l.text);
      else cur.subs.push(l.text);
    }
    if (/^Lessons and Psalm/.test(l.text)) rite = null;
  }

  const feasts = [];
  const problems = [];
  for (const p of propers) {
    const heading = p.names.reduce(join, '');
    const trial = /^\[.*\]$/.test(heading);
    const title = heading.replace(/^\[|\]$/g, '').trim();
    // Its line on the Calendar (the names with who they were, and when they died).
    const first = plain(p.names[0].replace(/^\[/, ''));
    const named = onCalendar.filter((c) => plain(c.text).startsWith(first));
    let when = p.date;
    if (!when || when === 'movable') {
      // A heading whose page doesn't carry its date: find it on the Calendar.
      when = when !== 'movable' && named.length === 1 ? named[0].date : null;
    }
    // Where the Calendar names it a little differently ("Scholastica" for
    // "Scholastica of Nursia"), the one line of its kind on its day.
    const sameKind = onCalendar.filter((c) => c.date === when && c.trial === trial);
    const line = (named.find((c) => c.date === when) || (sameKind.length === 1 ? sameKind[0] : null))?.text || null;
    if (!when) {
      if (!/^Thanksgiving Day$/.test(title)) problems.push(`No date for ${title}`);
      continue;
    }
    if (MAJOR_DATES.has(when)) continue;
    for (const r of ['traditional', 'contemporary']) p[r] = p[r].replace(/\s+([.,;:])/g, '$1');
    if (!/Amen\.$/.test(p.traditional) || !/Amen\.$/.test(p.contemporary)) {
      problems.push(`The collects for ${title} weren’t read whole`);
      continue;
    }
    feasts.push({
      date: when,
      title,
      sub: p.subs.join('; ') || null,
      ...(line ? { line } : {}),
      page: p.page,
      ...(trial ? { trial: true } : {}),
      traditional: p.traditional,
      contemporary: p.contemporary,
    });
  }
  return { edition, title: `Lesser Feasts and Fasts ${edition}`, feasts, calendar: onCalendar, problems };
}

/** Read the PDF the person chose: pdf.js, page by page, then parseLff. */
export async function readLffPdf(file, onProgress) {
  const pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, disableFontFace: true });
  const lines = [];
  try {
    const doc = await task.promise;
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      lines.push(...linesOf((await page.getTextContent()).items, p));
      page.cleanup();
      onProgress?.(p, doc.numPages);
    }
  } finally {
    await task.destroy();
  }
  return parseLff(lines);
}

// ---------- kept on this device ----------

/** The book as read, kept apart from your lists so it isn't saved again with every check-off. */
export class LffLibrary {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.data = this.read();
    this.index();
  }

  read() {
    try {
      const d = JSON.parse(this.storage?.getItem(LFF_KEY) || 'null');
      return d && Array.isArray(d.feasts) ? d : null;
    } catch {
      return null;
    }
  }

  index() {
    this.byDate = new Map();
    for (const f of this.data?.feasts || []) {
      if (!this.byDate.has(f.date)) this.byDate.set(f.date, []);
      this.byDate.get(f.date).push(f);
    }
  }

  /** Keep a copy (as read here, or from another device). Returns false if storage is full. */
  save(data) {
    try {
      this.storage.setItem(LFF_KEY, JSON.stringify(data));
    } catch {
      return false;
    }
    this.data = data;
    this.index();
    return true;
  }

  clear() {
    try { this.storage.removeItem(LFF_KEY); } catch { /* storage unavailable */ }
    this.data = null;
    this.index();
  }

  /** The lesser feasts kept on a date, by the rules of precedence: [] on a day with an observance of its own. */
  feastsFor(dateKey) {
    const list = this.byDate.get(dateKey.slice(5)) || [];
    if (!list.length || observance(dateKey)) return [];
    return list;
  }
}

/** The lesser feasts to keep on a date: none if they're turned off, or not loaded on this device. */
export function keptFeasts(library, settings, dateKey) {
  if (!library?.data || settings?.lesserFeasts === false) return [];
  // The commemorations for trial use come after the others.
  return [...library.feastsFor(dateKey)].sort((x, y) => (x.trial ? 1 : 0) - (y.trial ? 1 : 0));
}

/** A lesser feast's collect in the chosen language, shaped like the Collect of the Day (see collects.js). */
export function feastCollect(f, rite, library) {
  const r = rite === 'traditional' ? 'traditional' : 'contemporary';
  return {
    id: `lff-${f.date}${f.trial ? '-trial' : ''}`,
    title: f.title,
    sub: f.sub,
    line: f.line || [f.title, f.sub].filter(Boolean).join(', '),
    text: f[r],
    page: f.page,
    trial: !!f.trial,
    book: library?.data?.title || 'Lesser Feasts and Fasts',
  };
}

/** Where to find a lesser feast's collect: its line on the Calendar, the book and page. */
export function feastSource(c) {
  return [c.line, c.trial ? 'for trial use' : null, `${c.book}, page ${c.page}`].filter(Boolean).join(' · ');
}
