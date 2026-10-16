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

const FALLBACKS = { shop_name: 'there', category: 'business', city: 'your area', area: 'your area', address: '', rating: '', owner_name: 'there' };

/** Put the shop's details into a template body. `shop` can be a business object or just a name. */
export function fillTemplate(body, shop) {
  const details = shopDetails(shop);
  return String(body || '').replace(/\{\s*([a-z_]+)\s*\}/gi, (whole, tag) => {
    const key = tag.toLowerCase();
    if (!(key in FALLBACKS)) return whole;           // not one of ours: leave the text exactly as written
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
