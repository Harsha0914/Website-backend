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

/** Put the shop's name into a template body. */
export function fillTemplate(body, shopName) {
  const name = (shopName || '').trim() || 'there';
  return String(body || '').replace(/\{shop_name\}/g, name);
}
