// Calendar dates are handled as "date keys": 'YYYY-MM-DD' strings in the
// user's local calendar. Arithmetic is done in UTC so daylight-saving changes
// can never shift a day. Keys compare correctly as plain strings.

const DAY_MS = 86400000;

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

const pad = (n) => String(n).padStart(2, '0');

export function keyFromParts(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m, d };
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function isValidKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const { y, m, d } = parseKey(key);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function todayKey(now = new Date()) {
  return keyFromParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function toUTC(key) {
  const { y, m, d } = parseKey(key);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(t) {
  const dt = new Date(t);
  return keyFromParts(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(key, n) {
  return fromUTC(toUTC(key) + n * DAY_MS);
}

/** Whole days from a to b (positive when b is later). */
export function diffDays(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(key) {
  return new Date(toUTC(key)).getUTCDay();
}

export function addMonths(key, n) {
  const { y, m, d } = parseKey(key);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return keyFromParts(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function formatDate(key, opts) {
  return new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', ...opts }).format(new Date(toUTC(key)));
}

/** "Monday, November 2" */
export const formatLong = (key) => formatDate(key, { weekday: 'long', month: 'long', day: 'numeric' });
/** "Nov 2" */
export const formatShort = (key) => formatDate(key, { month: 'short', day: 'numeric' });
/** "Mon, Nov 2" */
export const formatMedium = (key) => formatDate(key, { weekday: 'short', month: 'short', day: 'numeric' });
/** "Nov 2, 2026" */
export const formatWithYear = (key) => formatDate(key, { month: 'short', day: 'numeric', year: 'numeric' });

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
