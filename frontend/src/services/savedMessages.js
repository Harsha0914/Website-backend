/**
 * The message text a user last wrote for each message type, remembered on this device until they change it again.
 * Saved per signed-in user and per message type, with the shop's name stored as {shop_name} so that the wording
 * is reused for every shop (each shop still gets its own name in it).
 */
import api from './api';

const PREFIX = 'wa_saved_message';

function userKey() {
  try {
    const user = JSON.parse(localStorage.getItem('user_info') || 'null');
    return String(user?.id ?? user?.email ?? 'anonymous');
  } catch {
    return 'anonymous';
  }
}

const keyFor = (templateId) => `${PREFIX}:${userKey()}:${templateId}`;

/** The saved wording for this message type (with {shop_name} placeholders), or null when nothing was saved. */
export function getSavedMessage(templateId) {
  try {
    const value = localStorage.getItem(keyFor(templateId));
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

// The account's copy on the server, so the wording follows the account to any device and survives a restart.
const pending = new Map();   // templateId -> timer of the save that is about to be sent

function sendToServer(templateId, text) {
  clearTimeout(pending.get(templateId));
  pending.set(templateId, setTimeout(() => {
    pending.delete(templateId);
    api.put(`/ai-whatsapp/saved-messages/${encodeURIComponent(templateId)}`, { text }).catch(() => { /* kept on this device; saved to the server on the next edit */ });
  }, 600));
}

/** Replace what was saved before. The newest text always wins and stays until the next change. */
export function saveMessage(templateId, text) {
  try {
    if (text && text.trim()) localStorage.setItem(keyFor(templateId), text);
    else localStorage.removeItem(keyFor(templateId));
  } catch {
    /* storage can be blocked (private window): the message simply is not remembered on this device */
  }
  sendToServer(templateId, text || '');
}

export function clearSavedMessage(templateId) {
  try { localStorage.removeItem(keyFor(templateId)); } catch { /* ignore */ }
  sendToServer(templateId, '');
}

/** Fetch the wording saved on the account and keep it on this device too. Call when a message screen opens. */
export async function syncSavedMessages() {
  try {
    const res = await api.get('/ai-whatsapp/saved-messages');
    const server = res.data || {};
    for (const [templateId, text] of Object.entries(server)) {
      if (pending.has(templateId)) continue;           // an edit is still on its way: do not overwrite it
      try { localStorage.setItem(keyFor(templateId), text); } catch { /* ignore */ }
    }
    return server;
  } catch {
    return null;                                       // offline or signed out: the copy on this device is used
  }
}

/** Turn a message written for one shop back into reusable wording: that shop's name and city become {shop_name} / {city}. */
export function toReusable(text, shop) {
  const name = String((typeof shop === 'string' ? shop : (shop?.name || shop?.shop_name)) || '').trim();
  const city = typeof shop === 'object' && shop ? String(shop.city || shop.area || '').trim() : '';
  let result = String(text);
  if (name && name !== 'your shop' && name !== 'there') result = result.split(name).join('{shop_name}');
  if (city.length >= 4) result = result.split(city).join('{city}');
  return result;
}
