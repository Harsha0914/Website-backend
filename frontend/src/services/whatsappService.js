import api from './api';
import { fillTemplate, getTemplate } from './whatsappTemplates';

/**
 * whatsappService.js
 *
 * WhatsApp Direct Connect & Lexon IT AI Bot Service.
 * Formats valid mobile numbers (+91-9XXXX-XXXXX) and manages Lexon IT WhatsApp API & Auto AI/Manual modes.
 */

/**
 * Normalises a shop phone number to digits with country code.
 * Returns '' when there is no plausible real number: numbers are NEVER invented.
 */
export function formatPhoneNumber(phone) {
  if (!phone) return '';
  const clean = String(phone).replace(/\D/g, '');

  // 11 digits with a leading 0 + Indian mobile (09100166100 -> 919100166100)
  if (clean.length === 11 && clean.startsWith('0') && ['6', '7', '8', '9'].includes(clean[1])) {
    return `91${clean.slice(1)}`;
  }
  // 12 digits with 91 prefix
  if (clean.length === 12 && clean.startsWith('91') && ['6', '7', '8', '9'].includes(clean[2])) {
    return clean;
  }
  // 10-digit Indian mobile
  if (clean.length === 10 && ['6', '7', '8', '9'].includes(clean[0])) {
    return `91${clean}`;
  }
  // Other international numbers (E.164 allows up to 15 digits)
  if (clean.length >= 11 && clean.length <= 15 && !clean.startsWith('0') && !clean.startsWith('91')) {
    return clean;
  }
  return '';
}

/**
 * Canonical Lexon IT WhatsApp Outreach Template.
 * Fills [Business Name] dynamically with the shop's name.
 */
export function getLexonOutreachMessage(businessName) {
  return fillTemplate(getTemplate('offer-link').body, businessName || 'Business Owner');
}

export function getWhatsAppUrl(business, customMsg = null) {
  const shopName = business?.name || 'your shop';
  const message = customMsg || getLexonOutreachMessage(shopName);

  const encodedMsg = encodeURIComponent(message);
  const phoneDigits = formatPhoneNumber(business?.phone, shopName, business?.id || business?.external_place_id || '');

  // Native WhatsApp App protocol: triggers the WhatsApp Desktop/Mobile app directly
  return `whatsapp://send?phone=${phoneDigits}&text=${encodedMsg}`;
}

export function getWhatsAppWebFallbackUrl(business, customMsg = null) {
  const shopName = business?.name || 'your shop';
  const phoneDigits = formatPhoneNumber(business?.phone, shopName, business?.id || business?.external_place_id || '');
  const msg = customMsg || `Hello ${shopName}, I would love to connect regarding your business website presence!`;
  return `https://web.whatsapp.com/send?phone=${phoneDigits}&text=${encodeURIComponent(msg)}`;
}

export async function launchWhatsAppApp(business, customMsg = null) {
  return sendDirectWhatsAppPitch(business, customMsg, true);
}




// ─── Backend API Integration Helpers ──────────────────────────────────────────

export async function startWhatsAppConversation(phone_number, shop_name = 'Local Shop', business_id = null) {
  const params = new URLSearchParams({ phone_number, shop_name });
  if (business_id) params.append('business_id', business_id);
  const res = await api.post(`/whatsapp/start?${params.toString()}`);
  return res.data;
}

export async function getWhatsAppConversations() {
  const res = await api.get('/whatsapp/conversations');
  return res.data;
}

export async function getWhatsAppConversation(id) {
  const res = await api.get(`/whatsapp/conversations/${id}`);
  return res.data;
}

export async function sendWhatsAppManualMessage(conversation_id, message, operator_name = 'Admin Operator') {
  const res = await api.post(`/whatsapp/conversations/${conversation_id}/messages`, {
    message,
    operator_name,
  });
  return res.data;
}

export async function toggleWhatsAppAIBot(conversation_id, enabled) {
  const res = await api.put(`/whatsapp/conversations/${conversation_id}/toggle-ai`, {
    enabled,
  });
  return res.data;
}

export async function toggleWhatsAppHumanTakeover(conversation_id, takeover) {
  const res = await api.put(`/whatsapp/conversations/${conversation_id}/takeover`, {
    takeover,
  });
  return res.data;
}

export async function updateWhatsAppLeadStatus(conversation_id, lead_status) {
  const res = await api.put(`/whatsapp/conversations/${conversation_id}/status`, {
    lead_status,
  });
  return res.data;
}

export async function updateWhatsAppRequirements(conversation_id, details) {
  const res = await api.put(`/whatsapp/conversations/${conversation_id}/requirements`, {
    details,
  });
  return res.data;
}

export async function markWhatsAppConversationRead(conversation_id) {
  const res = await api.post(`/whatsapp/conversations/${conversation_id}/mark-read`);
  return res.data;
}

export async function simulateIncomingWhatsAppMessage({ phone_number, shop_name, business_id, message, sender_name }) {
  const res = await api.post('/whatsapp/simulate-incoming', {
    phone_number,
    shop_name,
    business_id,
    message,
    sender_name,
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('whatsapp-updated', { detail: { phone_number, shop_name, inbound: true } }));
  }
  return res.data;
}

export async function getWhatsAppSummary() {
  const res = await api.get('/whatsapp/summary');
  return res.data;
}

export async function getWhatsAppDay(date) {
  const res = await api.get('/whatsapp/day', { params: { date } });
  return res.data;
}

export async function getWhatsAppStats(period = 'today', startDate = null, endDate = null) {
  const params = { period };
  if (startDate) params.start_date = startDate;
  if (endDate) params.end_date = endDate;
  const res = await api.get('/whatsapp/stats', { params });
  return res.data;
}

export async function trackWhatsAppContact(phone_number, shop_name, business_id = null, message_text = null) {
  const params = new URLSearchParams({ phone_number, shop_name });
  if (business_id) params.append('business_id', business_id);
  if (message_text) params.append('message_text', message_text);
  const res = await api.post(`/whatsapp/track-contact?${params.toString()}`);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('whatsapp-updated', { detail: { phone_number, shop_name, outbound: true } }));
  }
  return res.data;
}

export async function resetWhatsAppHistory() {
  const res = await api.delete('/whatsapp/reset');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('whatsapp-updated', { detail: { reset: true } }));
  }
  return res.data;
}

export async function deleteWhatsAppMessage(messageId) {
  const res = await api.delete(`/whatsapp/messages/${messageId}`);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('whatsapp-updated', { detail: { action: 'deleted', id: messageId } }));
  }
  return res.data;
}

export async function recordShopReply(phone_number, message_text = 'I want this website', shop_name = 'Shop Owner', lead_status = 'INTERESTED') {
  const res = await api.post('/whatsapp/record-reply', null, {
    params: {
      phone_number,
      message_text,
      shop_name,
      lead_status,
    },
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('whatsapp-updated', { detail: { phone_number, shop_name, inbound: true } }));
  }
  return res.data;
}

export async function getWhatsAppApiSettings() {
  const res = await api.get('/whatsapp/settings');
  return res.data;
}

export async function updateWhatsAppApiSettings(settings) {
  const res = await api.put('/whatsapp/settings', settings);
  return res.data;
}

export async function testWhatsAppCloudMessage(to_phone, message) {
  const res = await api.post('/whatsapp/settings/test', null, {
    params: { to_phone, message },
  });
  return res.data;
}

export async function broadcastWhatsAppToAllShops({ shops, customMessage, autoAIEnabled = true, includeFlyer = true }) {
  const res = await api.post('/ai-whatsapp/broadcast-all', {
    shops: shops.map(s => ({
      business_id: s.id || s.business_id,
      name: s.name || s.shop_name,
      phone: s.phone || s.phone_number,
      category: s.category,
      address: s.address || s.short_address,
      external_place_id: s.external_place_id || s.place_id,
    })),
    custom_message: customMessage,
    auto_ai_enabled: autoAIEnabled,
    include_flyer: includeFlyer,
  });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('whatsapp-updated', {
      detail: {
        broadcast: true,
        count: res.data?.total_sent ?? 0,
      }
    }));
  }

  return res.data;
}

/**
 * Directly sends an outreach pitch or message to a specific shop person via Lexon IT WhatsApp API.
 * Dispatches directly along with the EasyBillBro Restaurant Billing flyer image.
 */
export async function sendDirectWhatsAppPitch(business, customMessage = null, overridePhone = null, includeFlyer = true, { silent = false, imageId = null, templateKey = null } = {}) {
  const shopName = business?.name || business?.shop_name || 'Local Shop';
  const rawPhone = overridePhone || business?.phone || business?.phone_number || '';

  const targetPhone = String(rawPhone).replace(/\D/g, '');
  if (targetPhone.length < 10) {
    throw new Error(`Invalid phone number for ${shopName}: ${rawPhone}`);
  }

  const businessId = business?.id || business?.business_id;

  const defaultMsg = getLexonOutreachMessage(shopName);
  const messageToSend = customMessage || defaultMsg;

  // Send ONLY to the shop's number — never to user's own number as fallback
  const shopsPayload = [
    {
      business_id: businessId,
      name: shopName,
      phone: targetPhone,
      category: business?.category,
      address: business?.address || business?.short_address,
      external_place_id: business?.external_place_id || business?.place_id,
    }
  ];

  const res = await api.post('/ai-whatsapp/broadcast-all', {
    shops: shopsPayload,
    custom_message: messageToSend,
    auto_ai_enabled: true,
    include_flyer: imageId ? false : includeFlyer,
    image_id: imageId || undefined,
    template_key: templateKey || undefined,
  });

  const firstResult = res.data?.results?.[0];
  if (firstResult && firstResult.status === 'error') {
    throw new Error(firstResult.error || 'Failed to send WhatsApp message');
  }
  if (firstResult && firstResult.status === 'skipped') {
    const reasons = {
      no_valid_phone: 'this shop has no valid phone number',
      opted_out: 'this number opted out of messages',
      daily_limit_reached: 'the daily sending limit has been reached',
      recently_contacted: 'this shop was contacted recently',
      active_human_conversation: 'a team member is already chatting with this shop',
      duplicate_in_batch: 'duplicate number',
    };
    const skipErr = new Error(`Message not sent: ${reasons[firstResult.error] || firstResult.error || 'blocked'}`);
    skipErr.skipped = true;
    skipErr.reason = firstResult.error;
    throw skipErr;
  }

  if (typeof window !== 'undefined') {
    if (!silent) window.dispatchEvent(
      new CustomEvent('whatsapp-direct-sent', {
        detail: {
          shopName,
          phone: targetPhone,
          businessId,
          message: messageToSend,
          autoSent: true,
          mode: 'api',
        },
      })
    );
    window.dispatchEvent(
      new CustomEvent('whatsapp-updated', {
        detail: {
          outbound: true,
          phone_number: targetPhone,
          shop_name: shopName,
        },
      })
    );
  }

  return {
    success: true,
    shopName,
    phone: targetPhone,
    ...firstResult,
    total_sent: res.data?.total_sent,
  };
}

/**
 * No-op helper for backward compatibility (flyer removed).
 */
export async function copyFlyerToClipboard() {
  return false;
}

/**
 * Directly launches WhatsApp to the shop person with the full pitch prefilled.
 * Automatically chooses universal / web / app protocol and records the communication in backend CRM.
 */
export function launchDirectWhatsAppChat(business, customMsg = null, mode = 'web', overridePhone = null) {
  const shopName = business?.name || 'Local Shop';
  const rawPhone = overridePhone || business?.phone || business?.phone_number;
  if (!rawPhone) {
    console.error(`[launchDirectWhatsAppChat] No phone number for ${shopName}!`);
    return { success: false, error: 'No phone number' };
  }
  const phoneDigits = formatPhoneNumber(rawPhone, shopName, business?.id || business?.external_place_id || '');

  const defaultMsg = getLexonOutreachMessage(shopName);
  const message = customMsg || defaultMsg;
  const encodedMsg = encodeURIComponent(message);
  
  // Determine target URL (web opens web.whatsapp.com directly)
  let targetUrl = `https://web.whatsapp.com/send?phone=${phoneDigits}&text=${encodedMsg}`;
  if (mode === 'universal') {
    targetUrl = `https://api.whatsapp.com/send?phone=${phoneDigits}&text=${encodedMsg}`;
  }

  // 3. Open WhatsApp directly in new tab or app protocol using reliable anchor click
  try {
    const a = document.createElement('a');
    a.href = targetUrl;
    if (mode !== 'app') {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (_) {
    window.open(targetUrl, '_blank');
  }

  // 4. Record outbound contact in backend CRM stream
  trackWhatsAppContact(phoneDigits, shopName, business?.id, message).catch(() => {});

  // 5. Fire UI events for real-time updates and notification toast
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('whatsapp-direct-sent', {
        detail: {
          shopName,
          phone: phoneDigits,
          businessId: business?.id,
          message,
          mode,
          isUserNumber: phoneDigits.endsWith('7780181920'),
        },
      })
    );
    window.dispatchEvent(
      new CustomEvent('whatsapp-updated', {
        detail: {
          outbound: true,
          phone_number: phoneDigits,
          shop_name: shopName,
        },
      })
    );
  }

  return { success: true, phone: phoneDigits, shopName, message };
}

/** How a message to this number will really go out: 'free' (the shop wrote in the last 24 h) or 'template'. */
export async function getWhatsAppSendMode(phone, templateKey, picture = false) {
  const res = await api.get('/ai-whatsapp/send-mode', { params: { phone, template_key: templateKey || undefined, picture: picture ? 'true' : undefined } });
  return res.data; // { mode, template, template_ready }
}
