import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  X, Check, ArrowLeft, Search, Loader2, Send, Clock, AlertCircle, CheckCircle2, XCircle,
  MinusCircle, Pause, RotateCcw, MessageCircle, Play, Phone, ArrowRight, Users,
} from 'lucide-react';
import { sendDirectWhatsAppPitch, formatPhoneNumber } from '../../services/whatsappService';
import { WHATSAPP_TEMPLATES, DEFAULT_TEMPLATE_ID, getTemplate, fillTemplate } from '../../services/whatsappTemplates';
import MessageImagePicker, { FLYER_VALUE, pictureSrc } from '../whatsapp/MessageImagePicker';
import { imageCategoryFor, dominantImageCategory } from '../../utils/imageTools';
import { useContactedShops, contactedAt, contactedAgo, refreshContacted } from '../../services/contactedShops';

const GAP_BETWEEN_MESSAGES_MS = 2000; // a short pause between contacts keeps WhatsApp happy
const SECONDS_PER_CONTACT = 4;        // rough, for the "about N minutes left" hint
const DAILY_LIMIT_HINT = 200;

const shopKey = (s, i) => String(s.id ?? s.external_place_id ?? `${s.name}_${i}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const STATUS = {
  pending: { label: 'Waiting', color: 'var(--ui-muted)', Icon: Clock },
  sending: { label: 'Sending now', color: 'var(--ui-primary-text)', Icon: Loader2 },
  sent: { label: 'Sent', color: 'var(--ui-success)', Icon: CheckCircle2 },
  test: { label: 'Saved, not sent (test mode)', color: 'var(--ui-warning)', Icon: MinusCircle },
  skipped: { label: 'Skipped', color: 'var(--ui-warning)', Icon: MinusCircle },
  failed: { label: 'Failed', color: 'var(--ui-danger)', Icon: XCircle },
};

function StatusMark({ status }) {
  const { label, color, Icon } = STATUS[status] || STATUS.pending;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold shrink-0" style={{ color }}>
      <Icon className={`h-4 w-4 ${status === 'sending' ? 'animate-spin' : ''}`} aria-hidden="true" />
      {label}
    </span>
  );
}

/**
 * Send one message to many shops, one after another.
 *   1. Choose the shops (any number).   2. Pick a template and check the text.   3. Watch it send.
 * Each shop is sent to only after the previous one has finished, and every shop shows its own status.
 */
export default function BulkWhatsAppBroadcastModal({ isOpen, onClose, shops = [], onBroadcastComplete, onlyNoWebsiteDefault = false }) {
  const [step, setStep] = useState('select'); // 'select' | 'message' | 'send'
  const contactedState = useContactedShops(); // shops already messaged in the last 7 days
  const [selected, setSelected] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const [onlyNoSite, setOnlyNoSite] = useState(onlyNoWebsiteDefault);
  const [firstN, setFirstN] = useState('10');

  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_ID);
  const [message, setMessage] = useState(getTemplate(DEFAULT_TEMPLATE_ID).body);
  const [image, setImage] = useState(getTemplate(DEFAULT_TEMPLATE_ID).includeFlyer ? FLYER_VALUE : null);
  const [library, setLibrary] = useState([]);       // the account's pictures (loaded by the picker)
  const [matchPerShop, setMatchPerShop] = useState(false); // use each shop's own type of picture when there is one

  const [queue, setQueue] = useState([]);
  const [running, setRunning] = useState(false);
  const [haltNote, setHaltNote] = useState('');
  const stopRef = useRef(false);
  const queueRef = useRef([]);
  const currentRowRef = useRef(null);
  const reportedRef = useRef(false);

  // Only shops with a real phone number can be messaged.
  const contacts = useMemo(() => shops
    .map((s, i) => ({ shop: s, key: shopKey(s, i), name: s.name || s.shop_name || 'Shop', phone: formatPhoneNumber(s.phone || s.phone_number) }))
    .filter((c) => c.phone)
    .map((c) => ({ ...c, contactedAt: contactedAt(contactedState, c.phone) })), [shops, contactedState]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter((c) => {
      if (onlyNoSite && !(c.shop.website_status === 'NO_WEBSITE' || c.shop.website_status === 'WEBSITE_UNREACHABLE')) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.phone.includes(q.replace(/\D/g, '') || '\u0000');
    });
  }, [contacts, query, onlyNoSite]);

  useEffect(() => {
    if (!isOpen) return undefined;
    stopRef.current = false;
    reportedRef.current = false;
    setStep('select');
    setSelected(new Set());
    setQuery('');
    setOnlyNoSite(onlyNoWebsiteDefault);
    setFirstN('10');
    setQueue([]);
    queueRef.current = [];
    setRunning(false);
    setHaltNote('');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      stopRef.current = true; // closing the page or dialog stops any sending in progress
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !running) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, running, onClose]);

  const currentIndex = queue.findIndex((q) => q.status === 'sending');
  useEffect(() => {
    currentRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [currentIndex]);

  const counts = useMemo(() => {
    const c = { pending: 0, sending: 0, sent: 0, test: 0, skipped: 0, failed: 0 };
    queue.forEach((q) => { c[q.status] = (c[q.status] || 0) + 1; });
    return c;
  }, [queue]);

  const total = queue.length;
  const doneCount = counts.sent + counts.test + counts.skipped + counts.failed;

  const setQueueBoth = (next) => { queueRef.current = next; setQueue(next); };

  const runQueue = useCallback(async () => {
    stopRef.current = false;
    setHaltNote('');
    setRunning(true);
    const patch = (key, p) => setQueueBoth(queueRef.current.map((x) => (x.key === key ? { ...x, ...p } : x)));
    const todo = queueRef.current.filter((x) => x.status === 'pending').map((x) => x.key);

    for (let n = 0; n < todo.length; n += 1) {
      if (stopRef.current) break;
      const key = todo[n];
      const item = queueRef.current.find((x) => x.key === key);
      patch(key, { status: 'sending', note: '' });
      try {
        // Which picture goes to THIS shop: its own type's picture if asked and available, else the chosen one.
        let imageId = null;
        let flyer = false;
        if (matchPerShop) {
          const match = library.find((i) => i.category === imageCategoryFor(item.shop.category));
          if (match) imageId = match.id;
        }
        if (!imageId) {
          if (image?.kind === 'library') imageId = image.id;
          else if (image?.kind === 'flyer') flyer = true;
        }
        const res = await sendDirectWhatsAppPitch(item.shop, fillTemplate(message, item.name), item.phone, flyer, { silent: true, imageId, templateKey: templateId });
        if (res?.status === 'failed') throw new Error(res.error || 'The message could not be sent');
        patch(key, { status: res?.status === 'simulated' ? 'test' : 'sent', note: '' });
      } catch (err) {
        if (err?.skipped) {
          patch(key, { status: 'skipped', note: String(err.message || '').replace('Message not sent: ', '') });
          if (err.reason === 'daily_limit_reached') {
            setHaltNote('The daily sending limit has been reached, so the rest are still waiting. Continue tomorrow.');
            break;
          }
        } else {
          const detail = err?.response?.data?.detail;
          patch(key, { status: 'failed', note: (typeof detail === 'string' && detail) || err?.message || 'The message could not be sent' });
        }
      }
      if (n < todo.length - 1 && !stopRef.current) await sleep(GAP_BETWEEN_MESSAGES_MS);
    }
    setRunning(false);
  }, [message, image, library, matchPerShop, templateId]);

  // Tell the parent once, when everything that was going to be sent has finished.
  useEffect(() => {
    if (step !== 'send' || running || !total || reportedRef.current) return;
    if (counts.pending === 0 && counts.sending === 0) {
      reportedRef.current = true;
      refreshContacted();
      if (onBroadcastComplete) onBroadcastComplete({ sent: counts.sent + counts.test, failed: counts.failed, skipped: counts.skipped });
    }
  }, [step, running, total, counts, onBroadcastComplete]);

  const startSending = () => {
    const chosen = contacts.filter((c) => selected.has(c.key));
    reportedRef.current = false;
    setQueueBoth(chosen.map((c) => ({ ...c, status: 'pending', note: '' })));
    setStep('send');
    setTimeout(runQueue, 0);
  };

  const retryFailed = () => {
    reportedRef.current = false;
    setQueueBoth(queueRef.current.map((x) => (x.status === 'failed' ? { ...x, status: 'pending', note: '' } : x)));
    setTimeout(runQueue, 0);
  };

  const continueSending = () => { setTimeout(runQueue, 0); };

  const toggle = (key) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  // Shops messaged in the last 7 days cannot be picked: the server would skip them anyway.
  const pickable = visible.filter((c) => !c.contactedAt);
  const alreadyContactedCount = contacts.filter((c) => c.contactedAt).length;
  const selectFirst = (n) => setSelected(new Set(pickable.slice(0, n).map((c) => c.key)));
  const selectAllVisible = () => setSelected((prev) => new Set([...prev, ...pickable.map((c) => c.key)]));
  const allVisibleSelected = pickable.length > 0 && pickable.every((c) => selected.has(c.key));

  const pickTemplate = (t) => {
    setTemplateId(t.id);
    setMessage(t.body);
    setImage((current) => current ?? (t.includeFlyer ? FLYER_VALUE : null));
  };

  if (!isOpen) return null;

  const selectedCount = selected.size;
  const firstSelected = contacts.find((c) => selected.has(c.key));
  const previewName = firstSelected?.name || 'Shop name';
  const minutesLeft = Math.max(1, Math.ceil(((counts.pending + counts.sending) * SECONDS_PER_CONTACT) / 60));
  const current = queue.find((q) => q.status === 'sending');
  const finished = step === 'send' && !running && counts.pending === 0 && counts.sending === 0;
  const canClose = !running;
  const stepIndex = { select: 1, message: 2, send: 3 }[step];

  return createPortal(
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ zIndex: 9999, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && canClose) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-wa-title"
        className="ui-card qs-modal w-full flex flex-col sm:max-w-2xl"
        style={{ maxHeight: '94vh', height: step === 'message' ? 'auto' : '94vh' }}
      >
        {/* Header */}
        <div className="qs-head">
          <div className="flex items-start gap-3">
            {step === 'message' && (
              <button type="button" onClick={() => setStep('select')} className="qs-head-btn" aria-label="Back to shops">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <div className="flex-1 min-w-0">
              <h2 id="bulk-wa-title" className="qs-title">
                {step === 'select' && 'Quick Select'}
                {step === 'message' && 'Choose and check the message'}
                {step === 'send' && (finished ? 'Finished' : 'Sending messages')}
              </h2>
              <p className="qs-sub">
                {step === 'select' && 'Tick the shops you want to message. They are sent one at a time.'}
                {step === 'message' && 'Pick a template, check the wording and the picture.'}
                {step === 'send' && 'Keep this window open until all messages are done.'}
              </p>
            </div>
            <button type="button" onClick={onClose} disabled={!canClose} className="qs-head-btn" aria-label="Close" title={canClose ? 'Close' : 'Stop sending first'}>
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <ol className="qs-steps" aria-label="Progress">
            {['Choose shops', 'Message', 'Send'].map((label, idx) => {
              const n = idx + 1;
              const state = n < stepIndex ? 'done' : n === stepIndex ? 'current' : 'todo';
              return (
                <li key={label} className={`qs-step qs-step-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
                  <span className="qs-step-dot">{state === 'done' ? <Check className="h-3 w-3" aria-hidden="true" /> : n}</span>
                  {label}
                </li>
              );
            })}
          </ol>
        </div>

        {/* ───────── Step 1: choose shops ───────── */}
        {step === 'select' && (
          <>
            <div className="qs-toolbar">
              <div className="relative">
                <label htmlFor="bulk-search" className="sr-only">Search shops</label>
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: 'var(--ui-muted)' }} aria-hidden="true" />
                <input id="bulk-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by shop name or number" className="ui-input" style={{ paddingLeft: 40 }} autoComplete="off" />
              </div>
              <div className="qs-picks">
                <button type="button" className={`qs-pick ${onlyNoSite ? 'is-on' : ''}`} aria-pressed={onlyNoSite} onClick={() => setOnlyNoSite((v) => !v)}>
                  Only shops without a website
                </button>
                <button type="button" className="qs-pick" onClick={allVisibleSelected ? () => setSelected(new Set()) : selectAllVisible}>
                  {allVisibleSelected ? 'Clear all' : `Select all ${pickable.length}`}
                </button>
                <span className="qs-first">
                  <label htmlFor="bulk-firstn">First</label>
                  <input
                    id="bulk-firstn" type="number" min="1" max={visible.length || 1} value={firstN}
                    onChange={(e) => setFirstN(e.target.value)}
                    className="ui-input" style={{ width: 70, minHeight: 34, padding: '2px 10px' }}
                  />
                  <button type="button" className="qs-pick qs-pick-go" onClick={() => selectFirst(Math.max(1, parseInt(firstN, 10) || 1))}>Select</button>
                </span>
              </div>
              <p className="qs-count" aria-live="polite">
                <span className="qs-count-badge"><Users className="h-3.5 w-3.5" aria-hidden="true" />{selectedCount} selected</span>
                <span>{visible.length} shown · {contacts.length} shops have a phone number{alreadyContactedCount > 0 && ` · ${alreadyContactedCount} already contacted`}</span>
              </p>
            </div>

            <ul className="flex-1 overflow-y-auto min-h-0 qs-list" role="list">
              {visible.length === 0 && (
                <li className="p-8 text-center text-sm" style={{ color: 'var(--ui-muted)' }}>
                  {contacts.length === 0 ? 'None of these shops has a phone number we can message.' : 'No shop matches. Try clearing the search or the filter.'}
                </li>
              )}
              {visible.map((c) => {
                const checked = selected.has(c.key);
                const noSite = c.shop.website_status === 'NO_WEBSITE' || c.shop.website_status === 'WEBSITE_UNREACHABLE';
                return (
                  <li key={c.key}>
                    <label className={`qs-row ${checked ? 'is-checked' : ''} ${c.contactedAt ? 'is-contacted' : ''}`} title={c.contactedAt ? 'You already messaged this shop in the last 7 days' : undefined}>
                      <input type="checkbox" checked={checked} disabled={Boolean(c.contactedAt)} onChange={() => toggle(c.key)} className="qs-check" />
                      <span className="qs-avatar" aria-hidden="true">{(c.name || '?').trim().charAt(0).toUpperCase()}</span>
                      <span className="min-w-0 flex-1">
                        <span className="qs-name">{c.name}</span>
                        <span className="qs-phone"><Phone className="h-3 w-3" aria-hidden="true" />+{c.phone}</span>
                      </span>
                      {c.contactedAt && <span className="ui-badge ui-badge-info shrink-0"><Check className="h-3 w-3" aria-hidden="true" />Contacted {contactedAgo(c.contactedAt)}</span>}
                      <span className={`ui-badge ${noSite ? 'ui-badge-danger' : 'ui-badge-success'} shrink-0`}>{noSite ? 'No website' : 'Has website'}</span>
                    </label>
                  </li>
                );
              })}
            </ul>

            <div className="qs-foot">
              <p className="text-sm" style={{ color: selectedCount > DAILY_LIMIT_HINT ? 'var(--ui-warning)' : 'var(--ui-muted)' }}>
                {selectedCount > DAILY_LIMIT_HINT ? `The daily limit is about ${DAILY_LIMIT_HINT} messages; the rest will wait.` : 'Shops you contacted in the last 7 days are skipped.'}
              </p>
              <button type="button" disabled={selectedCount === 0} onClick={() => setStep('message')} className="ui-btn ui-btn-primary qs-next">
                Next: choose the message ({selectedCount})
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </>
        )}

        {/* ───────── Step 2: message ───────── */}
        {step === 'message' && (
          <>
            <div className="px-5 py-4 space-y-4 overflow-y-auto">
              <div>
                <p className="ui-label">Template</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Message template">
                  {WHATSAPP_TEMPLATES.map((t) => {
                    const active = templateId === t.id;
                    return (
                      <button
                        key={t.id} type="button" role="radio" aria-checked={active}
                        onClick={() => pickTemplate(t)}
                        className="ui-card text-left p-3"
                        style={active ? { borderColor: 'var(--ui-primary)', boxShadow: 'var(--ui-focus)' } : undefined}
                      >
                        <span className="block font-semibold text-sm" style={{ color: 'var(--ui-text)' }}>{t.name}</span>
                        <span className="block text-xs mt-0.5" style={{ color: 'var(--ui-muted)' }}>{t.tagline}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label htmlFor="bulk-message" className="ui-label">Message <span className="ui-muted">(you can edit it)</span></label>
                <textarea id="bulk-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={8} className="ui-input" style={{ lineHeight: 1.55, resize: 'vertical', minHeight: 150 }} />
                <p className="ui-help mt-1">The text <code>{'{shop_name}'}</code> is replaced with each shop's own name.</p>
              </div>

              <div className="ui-notice ui-notice-info" role="note">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  WhatsApp only allows free text and your own pictures to shops that messaged you in the last 24 hours. For every other shop the first
                  message goes as the approved template for this message, with fixed wording and picture.
                </span>
              </div>

              <MessageImagePicker
                value={image}
                onChange={setImage}
                category={dominantImageCategory(contacts.filter((c) => selected.has(c.key)).map((c) => c.shop))}
                onLibraryLoaded={setLibrary}
              />

              {library.length > 0 && (
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={matchPerShop} onChange={(e) => setMatchPerShop(e.target.checked)} className="mt-1 h-4 w-4" />
                  <span className="text-sm" style={{ color: 'var(--ui-text-2)' }}>
                    <strong style={{ color: 'var(--ui-text)' }}>Use a matching picture for each shop's type</strong><br />
                    A cafe gets one of your cafe pictures, a restaurant one of your restaurant pictures. Shops without a match get the picture chosen above.
                  </span>
                </label>
              )}

              <div>
                <p className="ui-label">Example for {previewName}</p>
                <div className="rounded-2xl p-3" style={{ background: 'var(--ui-surface-2)', border: '1px solid var(--ui-border)' }}>
                  <div className="ml-auto max-w-[92%] rounded-2xl px-3 py-3 text-sm" style={{ background: 'var(--ui-success-soft)', color: 'var(--ui-text)', border: '1px solid var(--ui-border)', borderBottomRightRadius: 4, overflowWrap: 'anywhere', lineHeight: 1.5 }}>
                    {image && (
                      <img src={pictureSrc(image)} alt="The picture that is sent with the message" className="w-full rounded-xl mb-2" style={{ maxHeight: 360, objectFit: 'cover', objectPosition: image.kind === 'flyer' ? 'top' : 'center' }} />
                    )}
                    <div className="whitespace-pre-wrap px-1">{fillTemplate(message, previewName).trim() || <span className="ui-muted">Your message is empty.</span>}</div>
                  </div>
                </div>
              </div>

            </div>

            <div className="px-5 py-4 border-t flex flex-wrap items-center justify-between gap-2" style={{ borderColor: 'var(--ui-border)' }}>
              <p className="text-sm" style={{ color: 'var(--ui-muted)' }}>
                Will be sent to {selectedCount} shop{selectedCount === 1 ? '' : 's'}, one after another.
              </p>
              <button type="button" onClick={startSending} disabled={!message.trim() || selectedCount === 0} className="ui-btn ui-btn-success">
                <Send className="h-4 w-4" aria-hidden="true" />
                Start sending to {selectedCount}
              </button>
            </div>
          </>
        )}

        {/* ───────── Step 3: progress ───────── */}
        {step === 'send' && (
          <>
            <div className="px-5 pt-4 pb-3 border-b space-y-3" style={{ borderColor: 'var(--ui-border)' }}>
              <div>
                <div className="flex items-center justify-between text-sm mb-1.5" style={{ color: 'var(--ui-text-2)' }}>
                  <span aria-live="polite">
                    {running && current && <>Sending to <strong style={{ color: 'var(--ui-text)' }}>{current.name}</strong> ({doneCount + 1} of {total})</>}
                    {running && !current && 'Getting the next shop ready…'}
                    {!running && !finished && 'Paused'}
                    {finished && `All done: ${doneCount} of ${total} processed`}
                  </span>
                  <span className="font-semibold" style={{ color: 'var(--ui-text)' }}>{Math.round((doneCount / Math.max(total, 1)) * 100)}%</span>
                </div>
                <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--ui-border)' }} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={doneCount}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${(doneCount / Math.max(total, 1)) * 100}%`, background: 'var(--ui-success)' }} />
                </div>
                {running && <p className="ui-help mt-1.5">About {minutesLeft} minute{minutesLeft === 1 ? '' : 's'} left. Keep this window open.</p>}
              </div>

              <div className="grid grid-cols-4 gap-2 text-center">
                {[
                  { label: 'Sent', value: counts.sent + counts.test, color: 'var(--ui-success)' },
                  { label: 'Waiting', value: counts.pending + counts.sending, color: 'var(--ui-text-2)' },
                  { label: 'Failed', value: counts.failed, color: 'var(--ui-danger)' },
                  { label: 'Skipped', value: counts.skipped, color: 'var(--ui-warning)' },
                ].map((c) => (
                  <div key={c.label} className="rounded-xl py-2" style={{ background: 'var(--ui-surface-2)', border: '1px solid var(--ui-border)' }}>
                    <div className="text-xl font-bold" style={{ color: c.color }}>{c.value}</div>
                    <div className="text-xs" style={{ color: 'var(--ui-muted)' }}>{c.label}</div>
                  </div>
                ))}
              </div>

              {haltNote && (
                <div className="ui-notice ui-notice-warning" role="alert">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{haltNote}</span>
                </div>
              )}
              {counts.test > 0 && (
                <div className="ui-notice ui-notice-warning" role="status">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{counts.test} message{counts.test === 1 ? ' was' : 's were'} only saved because the server is in test mode. They were not sent to WhatsApp.</span>
                </div>
              )}
            </div>

            <ul className="flex-1 overflow-y-auto min-h-0" role="list" aria-label="Progress for each shop">
              {queue.map((q, i) => (
                <li
                  key={q.key}
                  ref={q.status === 'sending' ? currentRowRef : null}
                  className="flex items-start gap-3 px-5 py-3 border-b"
                  style={{ borderColor: 'var(--ui-border)', background: q.status === 'sending' ? 'var(--ui-primary-soft)' : 'transparent' }}
                >
                  <span className="w-6 text-sm text-right shrink-0" style={{ color: 'var(--ui-muted)' }}>{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-sm truncate" style={{ color: 'var(--ui-text)' }}>{q.name}</span>
                    <span className="block text-xs" style={{ color: 'var(--ui-muted)' }}>+{q.phone}</span>
                    {q.note && <span className="block text-xs mt-1" style={{ color: q.status === 'failed' ? 'var(--ui-danger)' : 'var(--ui-warning)' }}>{q.note}</span>}
                  </span>
                  <StatusMark status={q.status} />
                </li>
              ))}
            </ul>

            <div className="px-5 py-4 border-t flex flex-wrap items-center justify-end gap-2" style={{ borderColor: 'var(--ui-border)' }}>
              {running && (
                <button type="button" onClick={() => { stopRef.current = true; }} className="ui-btn ui-btn-secondary">
                  <Pause className="h-4 w-4" aria-hidden="true" />
                  Stop after this shop
                </button>
              )}
              {!running && counts.pending > 0 && (
                <button type="button" onClick={continueSending} className="ui-btn ui-btn-success">
                  <Play className="h-4 w-4" aria-hidden="true" />
                  Continue ({counts.pending} waiting)
                </button>
              )}
              {!running && counts.failed > 0 && (
                <button type="button" onClick={retryFailed} className="ui-btn ui-btn-secondary">
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Try the {counts.failed} failed again
                </button>
              )}
              {!running && (
                <Link to="/whatsapp" onClick={onClose} className="ui-btn ui-btn-secondary">
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  Open WhatsApp chats
                </Link>
              )}
              {!running && (
                <button type="button" onClick={onClose} className="ui-btn ui-btn-primary">
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Done
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
