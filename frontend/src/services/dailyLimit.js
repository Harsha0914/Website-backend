/**
 * Today's sending limit for this account (100 messages per Indian day by default, with a heads-up at 50; set by the server).
 * The server sends the numbers back with every send, so the app can say "limit reached" the moment it happens.
 * `available` is false until the server has answered once, so the app never shows made-up numbers.
 */
import { useEffect, useSyncExternalStore } from 'react';
import api from './api';
import { parseServerDate, formatTimeIST } from '../utils/time';

let state = { limit: 100, warnAt: 50, sentToday: 0, remaining: Infinity, reached: false, resetsAt: null, loaded: false, available: false, announceId: 0, notice: null };
let inflight = null;
let lastAnnounce = 0;
const listeners = new Set();

const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

function fromServer(s) {
  return {
    limit: s.limit,
    warnAt: s.warn_at || 0,
    sentToday: s.sent_today,
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
  if (justReached || refused) {
    announceId += 1; notice = 'reached'; lastAnnounce = now;
  } else if (crossedWarn) {
    announceId += 1; notice = 'warn'; lastAnnounce = now;
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

export function useDailyLimit() {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => { if (!snapshot.loaded && !inflight) refreshDailyLimit(); }, [snapshot.loaded]);
  return snapshot;
}

/** "12:00 AM" style time when sending opens again, in Indian time. */
export function resetTimeLabel(resetsAt = state.resetsAt) {
  const d = parseServerDate(resetsAt);
  return d ? `${formatTimeIST(d)} (Indian time)` : '12:00 AM (Indian time)';
}

/** The sentence shown wherever the limit is reached. */
export function dailyLimitMessage() {
  return `You have reached your daily message limit of ${state.limit} messages. You can send more messages tomorrow, from ${resetTimeLabel()}.`;
}

/** The heads-up shown once the account has sent the "warn at" amount (50 of 100). */
export function dailyWarningMessage() {
  return `You have sent ${state.sentToday} messages today, and you have only ${state.remaining} messages remaining. Your daily message limit is ${state.limit} messages.`;
}
