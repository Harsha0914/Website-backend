/**
 * WhatsApp message templates.
 *
 * Bodies use {shop_name} as the place where the shop's name goes. Every template can be edited
 * before it is sent, so these are starting points, not fixed text.
 */

export const OFFER_LINK = 'https://easybillbro.com/';

export const WHATSAPP_TEMPLATES = [
  {
    id: 'offer-link',
    name: 'Website offer with link',
    tagline: 'A short offer for shops without a website, ending with our link.',
    includeFlyer: true,
    body:
      'Hello {shop_name},\n\n' +
      'This is Lexon IT. We help businesses grow online by building professional websites, web applications, and mobile apps tailored to their needs.\n\n' +
      'We noticed that {shop_name} doesn’t currently have a website. Today, customers often search online before choosing a business or service. A professional online presence can help you showcase your products or services, share important information, build trust, and make it easier for customers to contact you — 24/7.\n\n' +
      'Whether you need a simple website, an online booking or ordering system, a custom web application, or a mobile app, our team can build it for you at an affordable price.\n\n' +
      OFFER_LINK,
  },
  {
    id: 'about-company',
    name: 'About Lexon IT',
    tagline: 'A friendly introduction to who we are and what we build.',
    includeFlyer: false,
    body:
      'Hello {shop_name},\n\n' +
      'Greetings from Lexon IT!\n\n' +
      'About us: we help businesses grow online by building professional websites, web applications, and mobile apps tailored to their needs, at an affordable price.\n\n' +
      'What we can build for you:\n' +
      '• A business website\n' +
      '• An online booking or ordering system\n' +
      '• A custom web application\n' +
      '• A mobile app\n\n' +
      'If you would like to know more, just reply to this message and our team will be happy to help {shop_name}.',
  },
];

export const DEFAULT_TEMPLATE_ID = WHATSAPP_TEMPLATES[0].id;

export function getTemplate(id) {
  return WHATSAPP_TEMPLATES.find((t) => t.id === id) || WHATSAPP_TEMPLATES[0];
}

// ── Personalising a message for a shop ─────────────────────────────────────────
// Details a template (or your own edit of it) can use. Each one is filled in from the shop's own details:
//   {shop_name}  the shop's name          {category}  what kind of business it is (cafe, salon ...)
//   {city}       its town or city         {area}      the same as {city}, for wording like "in {area}"
//   {address}    its address              {rating}    its rating, such as 4.3
//   {owner_name} the owner, when known
// A detail the shop does not have is replaced by a neutral word, so a message never shows a gap or a raw {tag}.

const GENERIC_CATEGORY = /^(local[\s_-]*)?(shop|store|business|establishment|point[\s_-]*of[\s_-]*interest)$/i;

/** The shop's details as plain text, from a business object (or just a name). */
export function shopDetails(shop) {
  const s = typeof shop === 'string' ? { name: shop } : (shop || {});
  const clean = (v) => String(v ?? '').replace(/_/g, ' ').trim();
  const category = clean(s.category || s.business_type || s.type).toLowerCase();
  const city = clean(s.city || s.area || s.locality);
  return {
    shop_name: clean(s.name || s.shop_name),
    category: category && !GENERIC_CATEGORY.test(category) ? category : '',
    city,
    area: city,
    address: clean(s.address || s.short_address),
    rating: s.rating ? Number(s.rating).toFixed(1) : '',
    owner_name: clean(s.owner_name || s.owner),
  };
}

const FALLBACKS = { shop_name: 'there', category: 'business', city: 'your area', area: 'your area', address: '', rating: '', owner_name: 'there', products: 'products and services' };

// The ways a tag may be written. Spelling, capitals, spaces and punctuation do not matter, so {shop_name}, {Shop Name},
// {shopname} and {Business Name} all mean the same thing.
const TAG_ALIASES = {
  shopname: 'shop_name', businessname: 'shop_name', storename: 'shop_name', name: 'shop_name', shop: 'shop_name', store: 'shop_name', business: 'shop_name',
  category: 'category', businesstype: 'category', shoptype: 'category', businesscategory: 'category', type: 'category',
  city: 'city', town: 'city', location: 'city', locality: 'city', place: 'city', area: 'area',
  address: 'address', rating: 'rating', stars: 'rating',
  ownername: 'owner_name', owner: 'owner_name', contactname: 'owner_name', customername: 'owner_name',
  productsservices: 'products', productsandservices: 'products', productorservice: 'products', productsorservices: 'products', products: 'products', services: 'products',
};

/** Put the shop's details into a template body. `shop` can be a business object or just a name. */
export function fillTemplate(body, shop) {
  const details = { ...shopDetails(shop), products: '' };
  return String(body || '').replace(/\{\s*([^{}\n]{1,40}?)\s*\}/g, (whole, tag) => {
    const key = TAG_ALIASES[tag.toLowerCase().replace(/[^a-z]/g, '')];
    if (!key) return whole;                          // not one of ours: leave the text exactly as written
    return details[key] || FALLBACKS[key];
  });
}

const GREETING = /^\s*(?:hello|hi|hey|dear|greetings)[\s,]+([^\n,!.:;{}]{2,60}?)\s*[,!:]/i;

/**
 * A message pasted in that was written for ANOTHER shop ("Hello Sunrise Bakery, ...") gets that shop's name swapped
 * for this one's everywhere it appears. `replacement` is the current shop's name (or "{shop_name}" in the many-shops
 * box). The text is returned unchanged when no other shop's name is found.
 */
export function personalizePasted(text, replacement) {
  const match = GREETING.exec(String(text || ''));
  if (!match) return text;
  const found = match[1].trim();
  if (!found || /^(there|team|sir|madam|all|friend|everyone|owner|shop|your shop)$/i.test(found)) return text;
  if (found.toLowerCase() === String(replacement || '').toLowerCase()) return text;
  return String(text).split(found).join(replacement);
}

// First messages sent through the approved "flexible" template: WhatsApp allows 1024 characters in all, minus the wording the
// template uses itself and the shop's name. The text goes on one line (line breaks become " | "), which is longer than it looks.
export const FLEX_BODY_LIMIT = 1024;

export function flattenForTemplate(text) {
  return String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).join(' | ').trim();
}

/** { used, room, over } for a message about to go out as a first message to a shop. */
export function firstMessageRoom(text, fixedChars, shopName) {
  const used = flattenForTemplate(text).length;
  const room = FLEX_BODY_LIMIT - (fixedChars ?? 70) - String(shopName || '').length - 5;
  return { used, room, over: used - room };
}

/**
 * The message as the numbered parts it will go out in as a first message (the same cut as the server makes), or null when even
 * three parts are not enough. One part means it fits as it is.
 */
export function firstMessageParts(text, fixedChars, shopName, maxParts = 3) {
  const room = FLEX_BODY_LIMIT - (fixedChars ?? 70) - String(shopName || '').length - 5;
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.join(' | ').length <= room) return [flattenForTemplate(text)];
  const limit = Math.max(50, room - 8);
  const parts = [];
  let cur = '';
  for (let line of lines) {
    while (line.length > limit) {
      let cut = line.lastIndexOf(' ', limit - 1);
      cut = cut > 0 ? cut : limit;
      const piece = line.slice(0, cut).trim();
      line = line.slice(cut).trim();
      if (cur) { parts.push(cur); cur = ''; }
      parts.push(piece);
    }
    const candidate = cur ? `${cur} | ${line}` : line;
    if (candidate.length <= limit) cur = candidate;
    else { parts.push(cur); cur = line; }
  }
  if (cur) parts.push(cur);
  if (parts.length > maxParts) return null;
  return parts.length > 1 ? parts.map((p, i) => `${p} (${i + 1}/${parts.length})`) : parts;
}
