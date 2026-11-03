// Parsers for text pasted into "Paste a list". All of them are forgiving:
// they ignore blank lines and bullets, and report what they understood so
// the import screen can show a preview before anything is saved.

import { keyFromParts, daysInMonth } from './dates.js';

const BULLET_RE = /^\s*(?:[-*•·◦▪●○–—]+|\(?\d{1,3}[.)])\s+/;

/** Split into trimmed, non-empty lines. Tabs become `tab` (default: a space). */
export function cleanLines(text, tab = ' ') {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\u00a0/g, ' ').replace(/\t+/g, tab).replace(/[ \f\v]+/g, ' ').trim())
    .filter(Boolean);
}

const stripBullet = (l) => l.replace(BULLET_RE, '').trim();

/**
 * One entry per line. If the first line is a spreadsheet header with
 * "First" and "Last" columns (tab- or comma-separated), rows are read by column.
 * @returns {Array<{text: string, first?: string, last?: string}>}
 */
export function parseList(text) {
  const raw = String(text ?? '').replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim());
  if (raw.length > 1) {
    const table = readNameTable(raw);
    if (table) return table;
  }
  return cleanLines(text).map(stripBullet).filter(Boolean).map((t) => ({ text: t }));
}

function readNameTable(rows) {
  const delim = rows[0].includes('\t') ? '\t' : rows[0].includes(',') ? ',' : null;
  if (!delim) return null;
  const header = rows[0].split(delim).map((c) => c.trim().toLowerCase());
  const fi = header.findIndex((c) => /^first( name)?$|^given/.test(c));
  const li = header.findIndex((c) => /^last( name)?$|^surname|^family name/.test(c));
  if (fi < 0 || li < 0) return null;
  const out = [];
  for (const row of rows.slice(1)) {
    const cells = row.split(delim).map((c) => c.trim().replace(/^"|"$/g, ''));
    const first = cells[fi] || '';
    const last = cells[li] || '';
    if (!first && !last) continue;
    out.push({ text: [first, last].filter(Boolean).join(' '), first, last });
  }
  return out;
}

const WEEKDAY_WORDS = [
  ['sunday', 'sun'], ['monday', 'mon'], ['tuesday', 'tue', 'tues'], ['wednesday', 'wed', 'weds'],
  ['thursday', 'thu', 'thur', 'thurs'], ['friday', 'fri'], ['saturday', 'sat'],
];

function weekdayIndex(word) {
  const w = word.toLowerCase();
  return WEEKDAY_WORDS.findIndex((names) => names.includes(w) || names.includes(w.replace(/s$/, '')));
}

/** "Monday", "Monday:", "Mondays (A–C)", "Mon - John Smith" → { day, rest }. "Sun Li" → null. */
export function matchWeekdayHeader(line) {
  const m = line.match(/^([A-Za-z]+)\.?(?=$|[\s:\-–—(])\s*(.*)$/);
  if (!m) return null;
  const day = weekdayIndex(m[1]);
  if (day < 0) return null;
  const rest = m[2].trim();
  if (!rest || /^\(.*\)$/.test(rest)) return { day, rest: '' };
  const sep = rest.match(/^[:\-–—]\s*(.*)$/);
  return sep ? { day, rest: sep[1].trim() } : null;
}

/**
 * Names for a weekly list. A weekday on its own line ("Monday") starts that
 * day's names; names before any weekday get day = null.
 * @returns {{ entries: Array<{day: number|null, text: string, first?: string, last?: string}>, sawHeader: boolean }}
 */
export function parseWeekly(text) {
  const raw = String(text ?? '').replace(/\r\n?/g, '\n').split('\n').filter((l) => l.trim());
  const table = raw.length > 1 ? readNameTable(raw) : null;
  if (table) return { entries: table.map((e) => ({ ...e, day: null })), sawHeader: false };

  const entries = [];
  let day = null;
  let sawHeader = false;
  for (const line of cleanLines(text)) {
    const header = matchWeekdayHeader(line);
    if (header) {
      day = header.day;
      sawHeader = true;
      for (const name of header.rest.split(/\s*;\s*/).filter(Boolean)) entries.push({ day, text: name });
      continue;
    }
    const name = stripBullet(line);
    if (name) entries.push({ day, text: name });
  }
  return { entries, sawHeader };
}

const DAY_LINE_RE = /^(?:day\s+)?(\d{1,2})(?:st|nd|rd|th)?(?:\s*[.):\-–—]\s*|\s+|$)(.*)$/i;

/**
 * Entries for a monthly list.
 * Lines that start with a day number ("2 St Paul's") set the day; following
 * lines without a number are more entries for the same day. If no line has a
 * number, line 1 is day 1, line 2 is day 2, and so on.
 * @returns {{ entries: Array<{day: number, text: string}>, overflow: number, numbered: boolean }}
 */
export function parseMonthly(text) {
  const lines = cleanLines(text, ' — ');
  const numbered = lines.some((l) => {
    const m = l.match(DAY_LINE_RE);
    return m && +m[1] >= 1 && +m[1] <= 31;
  });
  const entries = [];
  if (!numbered) {
    lines.map(stripBullet).forEach((t, i) => {
      if (i < 31 && t) entries.push({ day: i + 1, text: t });
    });
    return { entries, overflow: Math.max(0, lines.length - 31), numbered };
  }
  let day = null;
  let overflow = 0;
  for (const line of lines) {
    const m = line.match(DAY_LINE_RE);
    if (m && +m[1] >= 1 && +m[1] <= 31) {
      day = +m[1];
      const rest = m[2].replace(/^[\s—–-]+/, '').trim();
      if (rest) entries.push({ day, text: rest });
      continue;
    }
    if (day == null) { overflow++; continue; } // a title line before day 1
    const t = stripBullet(line);
    if (t) entries.push({ day, text: t });
  }
  return { entries, overflow, numbered };
}

// ---------- dated lists (Anglican Cycle of Prayer) ----------

const MONTH_NUM = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11,
  november: 11, dec: 12, december: 12,
};
const MONTH_ALT = 'january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec';
const WD_ALT = 'sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|wed|thurs|thur|thu|fri|sat';
const WD = `(?:(?:${WD_ALT})\\.?,?\\s+)?`;
const REST = '(?:\\s*[:.|,\\-–—]\\s*|\\s+|$)(.*)$';

const DATE_PATTERNS = [
  // 2026-11-02
  { re: new RegExp(`^${WD}(\\d{4})-(\\d{1,2})-(\\d{1,2})${REST}`, 'i'), parts: (m) => [m[1], m[2], m[3], m[4]] },
  // 11/2/2026, 11/2/26, 11/2
  { re: new RegExp(`^${WD}(\\d{1,2})/(\\d{1,2})(?:/(\\d{4}|\\d{2}))?${REST}`, 'i'), parts: (m) => [m[3], m[1], m[2], m[4]] },
  // 2 November 2026, 02-Nov-2026, 2nd Nov
  {
    re: new RegExp(`^${WD}(\\d{1,2})(?:st|nd|rd|th)?[\\s-]+(${MONTH_ALT})\\.?(?:[\\s,-]+(\\d{4}|\\d{2})(?!\\d))?${REST}`, 'i'),
    parts: (m) => [m[3], MONTH_NUM[m[2].toLowerCase()], m[1], m[4]],
  },
  // November 2, 2026, Nov 2
  {
    re: new RegExp(`^${WD}(${MONTH_ALT})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?${REST}`, 'i'),
    parts: (m) => [m[3], MONTH_NUM[m[1].toLowerCase()], m[2], m[4]],
  },
];

// Calendars laid out by month: a heading ("NOVEMBER 2026"), then lines that
// give only the day and weekday ("2 Monday …" or "Monday 2 …").
const MONTH_HEADING_RE = new RegExp(`^(${MONTH_ALT})\\.?(?:,?\\s+(\\d{4}))?$`, 'i');
const DAY_THEN_WEEKDAY_RE = new RegExp(`^(\\d{1,2})(?:st|nd|rd|th)?\\.?\\s+(?:${WD_ALT})\\b\\.?${REST}`, 'i');
const WEEKDAY_THEN_DAY_RE = new RegExp(`^(?:${WD_ALT})\\.?,?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?![\\d/-])${REST}`, 'i');

export function matchMonthHeading(line) {
  const m = line.match(MONTH_HEADING_RE);
  return m ? { m: MONTH_NUM[m[1].toLowerCase()], y: m[2] ? Number(m[2]) : null } : null;
}

/** "2 Monday: …" or "Monday 2 …" (only meaningful under a month heading). */
export function matchDayOfMonthLine(line) {
  const m = line.match(DAY_THEN_WEEKDAY_RE) || line.match(WEEKDAY_THEN_DAY_RE);
  if (!m) return null;
  const d = Number(m[1]);
  return d >= 1 && d <= 31 ? { d, rest: (m[2] || '').trim() } : null;
}

/** Try to read a date at the start of a line. Returns { y|null, m, d, rest } or null. */
export function matchDateLine(line) {
  for (const { re, parts } of DATE_PATTERNS) {
    const m = line.match(re);
    if (!m) continue;
    const [y, mo, d, rest] = parts(m);
    const month = Number(mo);
    const day = Number(d);
    if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) continue;
    let year = y == null ? null : Number(y);
    if (year != null && year < 100) year += 2000;
    return { y: year, m: month, d: day, rest: (rest || '').trim() };
  }
  return null;
}

/**
 * Entries for a dated list, e.g. the Anglican Cycle of Prayer copied from its
 * PDF or web page. Each entry starts with a line beginning with a date; the
 * lines after it (until the next date) are that day's text.
 * Also accepts JSON: [{ date: 'YYYY-MM-DD', text, note? }].
 * @returns {{ entries: Array<{date: string, text: string, note?: string}>, first: string|null, last: string|null }}
 */
export function parseDated(text, { defaultYear = new Date().getFullYear() } = {}) {
  const json = tryJson(text);
  if (json) return summarize(json);

  const lines = cleanLines(text, ' — ');
  const isNoise = noiseFilter(lines);
  const entries = [];
  let year = defaultYear;
  let lastMonth = null;
  let current = null;

  const finish = () => {
    if (!current) return;
    const body = current.lines;
    const textLine = current.rest || body.shift();
    if (textLine) {
      const entry = { date: current.date, text: textLine };
      if (body.length) entry.note = body.join('\n');
      entries.push(entry);
    }
    current = null;
  };

  let monthHeading = null;
  for (const line of lines) {
    const heading = matchMonthHeading(line);
    if (heading) {
      if (heading.y) year = heading.y;
      else if (lastMonth != null && heading.m < lastMonth - 6) year += 1;
      lastMonth = heading.m;
      monthHeading = heading.m;
      continue;
    }
    let dm = matchDateLine(line);
    if (!dm && monthHeading) {
      const dd = matchDayOfMonthLine(line);
      if (dd) dm = { y: year, m: monthHeading, d: dd.d, rest: dd.rest };
    }
    if (dm) {
      if (dm.y != null) year = dm.y;
      else if (lastMonth != null && dm.m < lastMonth - 6) year += 1; // December → January
      lastMonth = dm.m;
      if (dm.d <= daysInMonth(year, dm.m)) {
        finish();
        current = { date: keyFromParts(year, dm.m, dm.d), rest: dm.rest.replace(/^[\s—–-]+/, ''), lines: [] };
        continue;
      }
    }
    if (current && !isNoise(line)) current.lines.push(line);
  }
  finish();
  return summarize(entries);
}

function tryJson(text) {
  const t = String(text ?? '').trim();
  if (!/^[[{]/.test(t)) return null;
  try {
    const data = JSON.parse(t);
    const arr = Array.isArray(data) ? data : Array.isArray(data.entries) ? data.entries : null;
    if (!arr) return null;
    return arr
      .filter((e) => e && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.text)
      .map((e) => ({ date: e.date, text: String(e.text), ...(e.note ? { note: String(e.note) } : {}) }));
  } catch {
    return null;
  }
}

/** Page numbers, "Page 3 of 40", and header/footer lines repeated on many pages. */
function noiseFilter(lines) {
  const counts = new Map();
  for (const l of lines) if (!matchDateLine(l)) counts.set(l, (counts.get(l) || 0) + 1);
  return (l) => /^\d{1,4}$/.test(l) || /^page \d+( of \d+)?$/i.test(l) || (counts.get(l) || 0) >= 5;
}

function summarize(entries) {
  let first = null;
  let last = null;
  for (const e of entries) {
    if (!first || e.date < first) first = e.date;
    if (!last || e.date > last) last = e.date;
  }
  return { entries, first, last };
}
