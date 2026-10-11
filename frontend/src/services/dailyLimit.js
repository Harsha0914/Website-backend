/**
 * Today's sending limit for this account (50 messages per Indian day by default, set by the server).
 * The server sends the numbers back with every send, so the app can say "limit reached" the moment it happens.
 * `available` is false until the server has answered once, so the app never shows made-up numbers.
 */
import { useEffect, useSyncExternalStore } from 'react';
import api from './api';
import { parseServerDate, formatTimeIST } from '../utils/time';

let state = { limit: 50, sentToday: 0, remaining: Infinity, reached: false, resetsAt: null, loaded: false, available: false, announceId: 0 };
let inflight = null;
let lastAnnounce = 0;
const listeners = new Set();

const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

function fromServer(s) {
  return {
    limit: s.limit,
    sentToday: s.sent_today,
    remaining: s.remaining == null ? Infinity : s.remaining,   // 0 limit on the server means "no limit"
    reached: Boolean(s.reached),
    resetsAt: s.resets_at || null,
  };
}

/**
 * Take the numbers the server sent along with a send. announce=true shows the "limit reached" message.
 * It is announced when the limit has just been reached, or when a send was refused because of it.
 */
export function setDailyLimit(serverStatus, { blocked = false } = {}) {
  if (!serverStatus) return;
  const next = fromServer(serverStatus);
  const justReached = next.reached && !state.reached;
  const now = Date.now();
  let announceId = state.announceId;
  if (next.reached && (justReached || (blocked && now - lastAnnounce > 30000))) {
    announceId += 1;
    lastAnnounce = now;
  }
  state = { ...state, ...next, loaded: true, available: true, announceId };
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
  return `You have reached today's limit of ${state.limit} messages. You can send again from ${resetTimeLabel()} tomorrow.`;
}
