/**
 * Today's sending limit, SHARED by every account (100 messages per Indian day by default, with a heads-up at 50; set by the server).
 * The server sends the numbers back with every send, and the app asks again every few seconds while it is open, so every
 * signed-in account sees the same total and the same notices almost at once.
 * `available` is false until the server has answered once, so the app never shows made-up numbers.
 */
import { useEffect, useSyncExternalStore } from 'react';
import api from './api';
import { parseServerDate, formatTimeIST } from '../utils/time';

let state = { limit: 100, warnAt: 50, sentToday: 0, mySentToday: 0, remaining: Infinity, reached: false, resetsAt: null, loaded: false, available: false, announceId: 0, notice: null };
let inflight = null;
let lastAnnounce = 0;
const listeners = new Set();

// A notice that was already shown today (Indian day) in this browser is not repeated when the page is opened again.
const dayKey = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
function seenToday(kind) {
  try { return localStorage.getItem(`dailyLimitSeen:${kind}`) === dayKey(); } catch { return false; }
}
function markSeen(kind) {
  try { localStorage.setItem(`dailyLimitSeen:${kind}`, dayKey()); } catch { /* storage may be blocked */ }
}

const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

function fromServer(s) {
  return {
    limit: s.limit,
    warnAt: s.warn_at || 0,
    sentToday: s.sent_today,
    mySentToday: s.my_sent_today == null ? 0 : s.my_sent_today,
    remaining: s.remaining == null ? Infinity : s.remaining,   // 0 limit on the server means "no limit"
    reached: Boolean(s.reached),
    resetsAt: s.resets_at || null,
  };
}

/**
 * Take the numbers the server sent along with a send. A notice is raised only for something that happens NOW:
 *   'warn'    - this send took the account up to the heads-up amount (50 sent, 50 left);
 *   'reached' - this send used the last message of the day, or a send was refused because it is used up.
 * Loading the page never raises a notice; the counter on the page already shows the numbers.
 */
export function setDailyLimit(serverStatus, { blocked = false } = {}) {
  if (!serverStatus) return;
  const next = fromServer(serverStatus);
  const known = state.available;            // we already had numbers from before this send
  const now = Date.now();
  let { announceId, notice } = state;
  const justReached = known && next.reached && !state.reached;
  const refused = known && blocked && next.reached && now - lastAnnounce > 30000;
  const crossedWarn = known && next.warnAt > 0 && !next.reached && state.sentToday < next.warnAt && next.sentToday >= next.warnAt;
  const pastWarnOnArrival = !known && next.warnAt > 0 && next.sentToday >= next.warnAt && !next.reached && !seenToday('warn');
  const reachedOnArrival = !known && next.reached && !seenToday('reached');
  if (justReached || refused || reachedOnArrival) {
    announceId += 1; notice = 'reached'; lastAnnounce = now; markSeen('reached');
  } else if (crossedWarn || pastWarnOnArrival) {
    announceId += 1; notice = 'warn'; lastAnnounce = now; markSeen('warn');
  }
  state = { ...state, ...next, loaded: true, available: true, announceId, notice };
  emit();
}

export function refreshDailyLimit() {
  if (inflight) return inflight;
  inflight = api.get('/ai-whatsapp/daily-limit')
    .then((res) => setDailyLimit(res.data))
    .catch(() => { state = { ...state, loaded: true }; emit(); })   // never block the page because of this
    .finally(() => { inflight = null; });
  return inflight;
}

// Ask the server again every few seconds while someone is looking at the page, so the shared count stays live.
const POLL_MS = 10000;
let pollTimer = null;
let watchers = 0;
function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => { if (!document.hidden) refreshDailyLimit(); }, POLL_MS);
  document.addEventListener('visibilitychange', onVisible);
}
function stopPolling() {
  clearInterval(pollTimer); pollTimer = null;
  document.removeEventListener('visibilitychange', onVisible);
}
function onVisible() { if (!document.hidden) refreshDailyLimit(); }

export function useDailyLimit() {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => { if (!snapshot.loaded && !inflight) refreshDailyLimit(); }, [snapshot.loaded]);
  useEffect(() => {
    watchers += 1;
    startPolling();
    return () => { watchers -= 1; if (watchers <= 0) { watchers = 0; stopPolling(); } };
  }, []);
  return snapshot;
}

/** "12:00 AM" style time when sending opens again, in Indian time. */
export function resetTimeLabel(resetsAt = state.resetsAt) {
  const d = parseServerDate(resetsAt);
  return d ? `${formatTimeIST(d)} (Indian time)` : '12:00 AM (Indian time)';
}

/** The sentence shown wherever the limit is reached. */
export function dailyLimitMessage() {
  return `The shared daily limit of ${state.limit} messages has been reached. No account can send more messages until it resets tomorrow, from ${resetTimeLabel()}.`;
}

/** The heads-up shown to every account once the shared total reaches the "warn at" amount (50 of 100). */
export function dailyWarningMessage() {
  return `${state.sentToday} messages have been sent today. Only ${state.remaining} messages remain out of the shared daily limit of ${state.limit}.`;
}
