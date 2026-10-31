/**
 * Which shops have been messaged by any account in the last few days (30 by default, set by the server).
 * Shared by every account: a shop any account messaged shows as contacted for all of them (only the number and date are shared).
 * The server returns only the phone number and the date, never any chat.
 */
import { useEffect, useSyncExternalStore } from 'react';
import api from './api';
import { parseServerDate, formatDateIST, daysAgoIST } from '../utils/time';

let state = { map: {}, days: 30, loaded: false, token: null, at: 0 };
const currentToken = () => { try { return localStorage.getItem('access_token') || ''; } catch (_) { return ''; } };
let inflight = null;
const listeners = new Set();

const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** The stable identity of a phone number: its last 10 digits. */
export const phoneKey = (phone) => String(phone || '').replace(/\D/g, '').slice(-10);

export function refreshContacted() {
  if (inflight) return inflight;
  const token = currentToken();
  inflight = api.get('/ai-whatsapp/recently-contacted')
    .then((res) => {
      const map = {};
      (res.data?.contacted || []).forEach((c) => { map[c.phone_key] = c.last_sent_at; });
      state = { map, days: res.data?.days || 30, loaded: true, token, at: Date.now() };
    })
    .catch(() => { state = { ...state, loaded: true }; })   // never block the page because of this
    .finally(() => { inflight = null; emit(); });
  return inflight;
}

/** One shop the server just refused as "contacted recently": show it as contacted at once, then re-read the full list. */
export function markContactedNow(phone) {
  const key = phoneKey(phone);
  if (key.length === 10) {
    state = { ...state, map: { ...state.map, [key]: state.map[key] || new Date().toISOString() } };
    emit();
  }
  refreshContacted();
}

/** { map, days, loaded }: loads once, then stays current when refreshContacted() is called after sending. */
export function useContactedShops() {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => {
    // A different account signed in (same tab), or the list is old: read it again, so "Contacted" always matches the server.
    if (state.token !== currentToken()) state = { map: {}, days: state.days, loaded: false, token: null, at: 0 };
    if ((!state.loaded || Date.now() - state.at > 8000) && !inflight) refreshContacted();
    const timer = setInterval(() => { if (!document.hidden) refreshContacted(); }, 15000);
    const onVisible = () => { if (!document.hidden) refreshContacted(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('whatsapp-updated', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible); window.removeEventListener('whatsapp-updated', onVisible); };
  }, []);
  return snapshot;
}

/** When this shop was last messaged (an ISO time) or null if it can be messaged. */
export function contactedAt(snapshot, phone) {
  const at = snapshot?.map?.[phoneKey(phone)];
  if (!at) return null;
  // A page left open for a long time: once the window has passed the shop can be messaged again.
  const sent = parseServerDate(at);
  const days = snapshot?.days || 30;
  if (sent && Date.now() - sent.getTime() > days * 86400000) return null;
  return at;
}

/** "Today", "Yesterday" or "3 days ago", in Indian time. */
export function contactedAgo(iso) {
  const n = daysAgoIST(iso);
  if (n == null) return '';
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  return `${n} days ago`;
}

/** The day this shop can be messaged again, e.g. "16 Oct". */
export function canMessageAgainOn(iso, days = 30) {
  const d = parseServerDate(iso);
  if (!d) return '';
  return formatDateIST(new Date(d.getTime() + days * 86400000), { day: 'numeric', month: 'short' });
}
