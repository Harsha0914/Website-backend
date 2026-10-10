/**
 * Which shops this account has already messaged in the last few days (7 by default, set by the server).
 * The shop cards show "Already contacted" instead of the send button, and Quick Select skips these shops.
 * The server only ever returns the signed-in account's own shops.
 */
import { useEffect, useSyncExternalStore } from 'react';
import api from './api';
import { parseServerDate, formatDateIST, daysAgoIST } from '../utils/time';

let state = { map: {}, days: 7, loaded: false };
let inflight = null;
const listeners = new Set();

const emit = () => listeners.forEach((fn) => fn());
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** The stable identity of a phone number: its last 10 digits. */
export const phoneKey = (phone) => String(phone || '').replace(/\D/g, '').slice(-10);

export function refreshContacted() {
  if (inflight) return inflight;
  inflight = api.get('/ai-whatsapp/recently-contacted')
    .then((res) => {
      const map = {};
      (res.data?.contacted || []).forEach((c) => { map[c.phone_key] = c.last_sent_at; });
      state = { map, days: res.data?.days || 7, loaded: true };
    })
    .catch(() => { state = { ...state, loaded: true }; })   // never block the page because of this
    .finally(() => { inflight = null; emit(); });
  return inflight;
}

/** { map, days, loaded }: loads once, then stays current when refreshContacted() is called after sending. */
export function useContactedShops() {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => { if (!snapshot.loaded && !inflight) refreshContacted(); }, [snapshot.loaded]);
  return snapshot;
}

/** When this shop was last messaged (an ISO time) or null if it can be messaged. */
export function contactedAt(snapshot, phone) {
  const at = snapshot?.map?.[phoneKey(phone)];
  return at || null;
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
export function canMessageAgainOn(iso, days = 7) {
  const d = parseServerDate(iso);
  if (!d) return '';
  return formatDateIST(new Date(d.getTime() + days * 86400000), { day: 'numeric', month: 'short' });
}
