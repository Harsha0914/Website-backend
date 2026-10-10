/**
 * Dates and times, always shown in Indian Standard Time (IST, UTC+5:30), whatever the device's clock says.
 *
 * The server stores every time in UTC and sends it WITHOUT a time-zone marker (for example
 * "2026-10-08T22:38:00"). A browser reads such text as local time, which shows the wrong hour. parseServerDate
 * treats marker-less text as UTC, then everything is formatted for Asia/Kolkata.
 */
export const IST = 'Asia/Kolkata';

export function parseServerDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  let text = String(value).trim();
  const looksLikeDateTime = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(text);
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(text);
  if (looksLikeDateTime && !hasZone) text = `${text.replace(' ', 'T')}Z`;
  const d = new Date(text);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "03:38 PM" */
export function formatTimeIST(value) {
  const d = parseServerDate(value);
  return d ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: IST }).toUpperCase() : '';
}

/** "9 Oct 2026" by default; pass Intl options to change the shape. */
export function formatDateIST(value, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const d = parseServerDate(value);
  return d ? d.toLocaleDateString('en-IN', { ...options, timeZone: IST }) : '';
}

/** "9 Oct 2026, 03:38 PM" */
export function formatDateTimeIST(value) {
  const d = parseServerDate(value);
  return d ? `${formatDateIST(d)}, ${formatTimeIST(d)}` : '';
}

/** The calendar day in India, as YYYY-MM-DD (for "today" / "yesterday" comparisons). */
function istDayNumber(d) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const [y, m, day] = parts.split('-').map(Number);
  return Date.UTC(y, m - 1, day) / 86400000;
}

/** How many calendar days ago (in India) a moment was: 0 = today, 1 = yesterday. */
export function daysAgoIST(value) {
  const d = parseServerDate(value);
  if (!d) return null;
  return Math.round(istDayNumber(new Date()) - istDayNumber(d));
}

/** Today's date in India as YYYY-MM-DD (the value a date picker uses). */
export function todayIST() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: IST, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** A plain YYYY-MM-DD day (already an Indian calendar day) as readable text, e.g. "9 Oct 2026". */
export function formatYmdIST(ymd, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!ymd) return '';
  return formatDateIST(`${ymd}T06:30:00Z`, options); // noon in India, so no zone can shift the date
}
