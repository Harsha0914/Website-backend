import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, ArrowLeft, Copy, Loader2, Send, AlertCircle, MessageCircle, FileText, Link2, Building2, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatPhoneNumber, sendDirectWhatsAppPitch, getWhatsAppSendMode } from '../../services/whatsappService';
import { WHATSAPP_TEMPLATES, getTemplate, fillTemplate } from '../../services/whatsappTemplates';
import MessageImagePicker, { FLYER_VALUE, pictureSrc } from '../whatsapp/MessageImagePicker';
import { imageCategoryFor } from '../../utils/imageTools';

const TEMPLATE_NOTE = {
  lexon_offer_link_v4: 'the approved “offer with link” template',
  lexon_about_company_v4: 'the approved “About Lexon IT” template',
  lexon_offer_link_v1: 'the approved “offer with link” template',
  lexon_about_company_v1: 'the approved “About Lexon IT” template',
  lexon_offer_link_v3: 'the approved “offer with link” template',
  lexon_about_company_v3: 'the approved “About Lexon IT” template',
  lexon_offer_link_v2: 'the approved “offer with link” template',
  lexon_about_company_v2: 'the approved “About Lexon IT” template',
};

const TEMPLATE_ICONS = { 'offer-link': Link2, 'about-company': Building2 };

/**
 * "Message on WhatsApp" dialog.
 *   Step 1: choose a template.
 *   Step 2: preview and (optionally) edit the message, then send it to this shop only.
 *   Step 3: confirmation.
 */
export default function WhatsAppLaunchModal({ business, isOpen, onClose, onSent }) {
  const shopName = business?.name || 'your shop';
  const phoneDigits = business ? formatPhoneNumber(business.phone || business.phone_number) : '';
  const phoneDisplay = phoneDigits ? `+${phoneDigits}` : '';

  const [step, setStep] = useState('choose'); // 'choose' | 'edit' | 'sent'
  const [templateId, setTemplateId] = useState(null);
  const [message, setMessage] = useState('');
  const [image, setImage] = useState(null); // null = text only, or { kind: 'flyer' } / { kind: 'library', id, ... }
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [sendMode, setSendMode] = useState(null); // how this shop can really be messaged (24-hour rule)
  const [testState, setTestState] = useState({ busy: false, ok: '', error: '' });
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    setStep('choose');
    setTemplateId(null);
    setMessage('');
    setImage(null);
    setSending(false);
    setError('');
    setCopied(false);
    setTestPhone('');
    setSendMode(null);
    setTestState({ busy: false, ok: '', error: '' });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    setTimeout(() => dialogRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, business?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen || step !== 'edit' || !phoneDigits || !templateId) return undefined;
    let cancelled = false;
    setSendMode(null);
    getWhatsAppSendMode(phoneDigits, templateId, !!image)
      .then((info) => { if (!cancelled) setSendMode(info); })
      .catch(() => { /* the note is only guidance; sending still works without it */ });
    return () => { cancelled = true; };
  }, [isOpen, step, phoneDigits, templateId, !!image]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen || !business) return null;

  const template = templateId ? getTemplate(templateId) : null;
  const filledTemplate = template ? fillTemplate(template.body, shopName) : '';
  const edited = template && message !== filledTemplate;

  const chooseTemplate = (t) => {
    setTemplateId(t.id);
    setMessage(fillTemplate(t.body, shopName));
    // keep a picture the user already chose; otherwise start from the template's default
    setImage((current) => current ?? (t.includeFlyer ? FLYER_VALUE : null));
    setError('');
    setStep('edit');
  };

  const handleSend = async () => {
    if (!message.trim() || sending) return;
    if (!phoneDigits) {
      setError('This shop has no valid phone number, so nothing can be sent.');
      return;
    }
    setSending(true);
    setError('');
    try {
      await sendDirectWhatsAppPitch(business, message.trim(), phoneDigits, image?.kind === 'flyer', {
        imageId: image?.kind === 'library' ? image.id : null,
        templateKey: templateId,
      });
      setStep('sent');
      if (onSent) onSent();
    } catch (err) {
      setError(err?.message || 'The message could not be sent. Please try again.');
    } finally {
      setSending(false);
    }
  };

  // Send exactly this message and picture to the user's OWN number, to see how it arrives on a phone.
  const handleSendTest = async () => {
    const digits = formatPhoneNumber(testPhone);
    if (!digits) {
      setTestState({ busy: false, ok: '', error: 'Please type your own WhatsApp number, for example 98765 43210.' });
      return;
    }
    if (!message.trim()) return;
    setTestState({ busy: true, ok: '', error: '' });
    try {
      await sendDirectWhatsAppPitch({ name: 'My test number' }, message.trim(), digits, image?.kind === 'flyer', {
        imageId: image?.kind === 'library' ? image.id : null,
        silent: true,
      });
      setTestState({ busy: false, ok: `Test sent to +${digits}. Open WhatsApp on that phone to see how it looks.`, error: '' });
    } catch (err) {
      setTestState({ busy: false, ok: '', error: err?.message || 'The test could not be sent.' });
    }
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard may be blocked */
    }
  };

  const title = step === 'choose' ? 'Choose a message' : step === 'edit' ? 'Check your message' : 'Message sent';

  return createPortal(
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ zIndex: 9999, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wa-modal-title"
        className="ui-card w-full flex flex-col outline-none sm:max-w-xl"
        style={{ maxHeight: '92vh', borderBottomLeftRadius: 0, borderBottomRightRadius: 0, boxShadow: 'var(--ui-shadow-lg)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--ui-border)' }}>
          {step === 'edit' && (
            <button type="button" onClick={() => setStep('choose')} className="ui-btn ui-btn-ghost ui-btn-sm" aria-label="Back to templates">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h2 id="wa-modal-title" className="font-bold text-base" style={{ color: 'var(--ui-text)' }}>{title}</h2>
            <p className="text-sm truncate" style={{ color: 'var(--ui-muted)' }}>
              To {shopName}{phoneDisplay ? ` · ${phoneDisplay}` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="ui-btn ui-btn-ghost ui-btn-sm" aria-label="Close">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 'choose' && (
            <div>
              <p className="ui-lead" style={{ marginBottom: 12 }}>Pick the message you want to send. You can still change the words on the next screen.</p>
              <ul className="space-y-3" role="list">
                {WHATSAPP_TEMPLATES.map((t) => {
                  const Icon = TEMPLATE_ICONS[t.id] || FileText;
                  const preview = fillTemplate(t.body, shopName).split('\n').filter(Boolean).slice(0, 3).join(' ');
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => chooseTemplate(t)}
                        className="ui-card ui-card-hover w-full text-left p-4 flex gap-3"
                      >
                        <span className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center" style={{ background: 'var(--ui-primary-soft)', color: 'var(--ui-primary-text)' }} aria-hidden="true">
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold" style={{ color: 'var(--ui-text)' }}>{t.name}</span>
                          <span className="block text-sm mt-0.5" style={{ color: 'var(--ui-text-2)' }}>{t.tagline}</span>
                          <span className="block text-xs mt-2 line-clamp-2" style={{ color: 'var(--ui-muted)' }}>{preview}</span>
                          <span className="ui-badge ui-badge-neutral mt-2">{t.includeFlyer ? 'Sent with our flyer image' : 'Text only'}</span>
                        </span>
                        {t.includeFlyer && (
                          <img src="/images/easybillbro-flyer.jpg" alt="" className="shrink-0 rounded-lg border self-start" style={{ width: 64, borderColor: 'var(--ui-border)' }} />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {step === 'edit' && template && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label htmlFor="wa-message" className="ui-label" style={{ margin: 0 }}>
                    Message <span className="ui-muted">(you can edit it)</span>
                  </label>
                  <span className="ui-badge ui-badge-info">{template.name}</span>
                </div>
                <textarea
                  id="wa-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={9}
                  className="ui-input"
                  style={{ lineHeight: 1.55, resize: 'vertical', minHeight: 160 }}
                />
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  <button type="button" onClick={copyText} className="ui-btn ui-btn-ghost ui-btn-sm">
                    {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
                    {copied ? 'Copied' : 'Copy text'}
                  </button>
                  {edited && (
                    <button type="button" onClick={() => setMessage(filledTemplate)} className="ui-btn ui-btn-ghost ui-btn-sm">
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      Back to the original
                    </button>
                  )}
                </div>
              </div>

              {sendMode?.mode === 'template' && (
                <div className="ui-notice ui-notice-warning" role="status">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    <strong>{shopName} has not messaged you in the last 24 hours.</strong> WhatsApp then only allows an approved template as a first
                    message.{' '}
                    {sendMode.template
                      ? <>This will be sent as {TEMPLATE_NOTE[sendMode.template] || `the approved template “${sendMode.template}”`}. {sendMode.with_picture ? 'Your picture goes in its header.' : 'It carries no picture.'} Its wording is fixed. Your edits to the text are used once the shop replies.</>
                      : <>The approved template for this message is not available yet, so it cannot be sent to this shop right now.</>}
                  </span>
                </div>
              )}

              <MessageImagePicker value={image} onChange={setImage} category={imageCategoryFor(business?.category)} />

              <div>
                <p className="ui-label">What {shopName} will see</p>
                <div className="rounded-2xl p-3" style={{ background: 'var(--ui-surface-2)', border: '1px solid var(--ui-border)' }}>
                  <div className="ml-auto max-w-[92%] rounded-2xl px-3 py-3 text-sm" style={{ background: 'var(--ui-success-soft)', color: 'var(--ui-text)', border: '1px solid var(--ui-border)', borderBottomRightRadius: 4, overflowWrap: 'anywhere', lineHeight: 1.5 }}>
                    {image && (
                      <img src={pictureSrc(image)} alt="The picture that is sent with the message" className="w-full rounded-xl mb-2" style={{ maxHeight: 360, objectFit: 'cover', objectPosition: image.kind === 'flyer' ? 'top' : 'center' }} />
                    )}
                    <div className="whitespace-pre-wrap px-1">{message.trim() || <span className="ui-muted">Your message is empty.</span>}</div>
                  </div>
                </div>
              </div>

              <details className="rounded-xl p-3" style={{ border: '1px solid var(--ui-border)', background: 'var(--ui-surface-2)' }}>
                <summary className="cursor-pointer text-sm font-semibold" style={{ color: 'var(--ui-text-2)' }}>
                  Send a test to my own number first
                </summary>
                <p className="ui-help mt-2">Sends this exact message and picture to your own WhatsApp number, not to the shop, so you can see how it arrives.</p>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[180px]">
                    <label htmlFor="wa-test-phone" className="ui-label">Your WhatsApp number</label>
                    <input id="wa-test-phone" type="tel" inputMode="tel" className="ui-input" placeholder="98765 43210" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} autoComplete="tel" />
                  </div>
                  <button type="button" className="ui-btn ui-btn-secondary" onClick={handleSendTest} disabled={testState.busy || !message.trim()}>
                    {testState.busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                    {testState.busy ? 'Sending…' : 'Send test to me'}
                  </button>
                </div>
                {testState.ok && <p className="ui-notice ui-notice-success mt-2" role="status">{testState.ok}</p>}
                {testState.error && <p className="ui-notice ui-notice-error mt-2" role="alert">{testState.error}</p>}
              </details>

              {!phoneDigits && (
                <div className="ui-notice ui-notice-warning" role="alert">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>This shop has no valid phone number, so it cannot be messaged.</span>
                </div>
              )}
              {error && (
                <div className="ui-notice ui-notice-error" role="alert">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          )}

          {step === 'sent' && (
            <div className="text-center py-6">
              <span className="mx-auto h-14 w-14 rounded-full flex items-center justify-center" style={{ background: 'var(--ui-success-soft)', color: 'var(--ui-success)' }} aria-hidden="true">
                <Check className="h-7 w-7" />
              </span>
              <h3 className="mt-3 font-bold text-lg" style={{ color: 'var(--ui-text)' }}>Sent to {shopName}</h3>
              <p className="mt-1 text-sm" style={{ color: 'var(--ui-text-2)' }}>
                The message went to {phoneDisplay} only. You will see their reply in WhatsApp chats.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Link to="/whatsapp" onClick={onClose} className="ui-btn ui-btn-primary">
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  Open WhatsApp chats
                </Link>
                <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">Close</button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'edit' && (
          <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: 'var(--ui-border)' }}>
            <button type="button" onClick={onClose} disabled={sending} className="ui-btn ui-btn-secondary">Cancel</button>
            <button type="button" onClick={handleSend} disabled={!message.trim() || sending || !phoneDigits} className="ui-btn ui-btn-success">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
              {sending ? 'Sending…' : 'Send WhatsApp message'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
