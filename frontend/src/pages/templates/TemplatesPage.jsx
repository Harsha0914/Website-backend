import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Link2, Building2, X, Check, RotateCcw, Save, Pencil, Image as ImageIcon } from 'lucide-react';
import Navbar from '../../components/layout/Navbar';
import Footer from '../../components/layout/Footer';
import { WHATSAPP_TEMPLATES, fillTemplate } from '../../services/whatsappTemplates';
import { getSavedMessage, saveMessage, clearSavedMessage, syncSavedMessages } from '../../services/savedMessages';

const ICONS = { 'offer-link': Link2, 'about-company': Building2 };

// An example shop, so the preview shows how the message reads once the details are filled in.
const SAMPLE_SHOP = { name: 'Prime Cafe', category: 'cafe', city: 'Hyderabad', rating: 4.3 };

// Details the user can drop into the text; each is filled in from the shop's own details when a message is sent.
const TAGS = [
  { tag: '{shop_name}', label: 'Shop name' },
  { tag: '{category}', label: 'Business type' },
  { tag: '{city}', label: 'City' },
  { tag: '{rating}', label: 'Rating' },
];

function TemplateEditor({ template, onClose, onSaved }) {
  const original = template.body;
  const [text, setText] = useState(() => getSavedMessage(template.id) || original);
  const [savedText, setSavedText] = useState(() => getSavedMessage(template.id) || original);
  const [justSaved, setJustSaved] = useState(false);
  const areaRef = useRef(null);
  const Icon = ICONS[template.id] || FileText;
  const dirty = text !== savedText;
  const isCustom = savedText !== original;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = () => {
    const value = text.trim() ? text : original;          // an empty message cannot be sent: fall back to the standard wording
    if (value === original) clearSavedMessage(template.id);
    else saveMessage(template.id, value);
    setText(value);
    setSavedText(value);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2500);
    onSaved();
  };

  const backToOriginal = () => {
    clearSavedMessage(template.id);
    setText(original);
    setSavedText(original);
    onSaved();
  };

  const insertTag = (tag) => {
    const box = areaRef.current;
    const start = box ? box.selectionStart : text.length;
    const end = box ? box.selectionEnd : text.length;
    const next = text.slice(0, start) + tag + text.slice(end);
    setText(next);
    setJustSaved(false);
    requestAnimationFrame(() => {
      if (!box) return;
      box.focus();
      box.setSelectionRange(start + tag.length, start + tag.length);
    });
  };

  return createPortal(
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ zIndex: 9999, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tpl-title"
        className="ui-card tpl-modal w-full flex flex-col outline-none sm:max-w-2xl"
        style={{ maxHeight: '92vh', borderBottomLeftRadius: 0, borderBottomRightRadius: 0, boxShadow: 'var(--ui-shadow-lg)' }}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--ui-border)' }}>
          <span className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center" style={{ background: 'var(--ui-primary-soft)', color: 'var(--ui-primary-text)' }} aria-hidden="true">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="tpl-title" className="font-bold text-base" style={{ color: 'var(--ui-text)' }}>{template.name}</h2>
            <p className="text-sm truncate" style={{ color: 'var(--ui-muted)' }}>{template.tagline}</p>
          </div>
          <button type="button" onClick={onClose} className="ui-btn ui-btn-ghost ui-btn-sm" aria-label="Close">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <label htmlFor="tpl-text" className="ui-label" style={{ margin: 0 }}>Message text <span className="ui-muted">(you can change, add or delete anything)</span></label>
              {isCustom && !dirty && <span className="ui-badge ui-badge-info">Your version</span>}
            </div>
            <textarea
              id="tpl-text"
              ref={areaRef}
              value={text}
              onChange={(e) => { setText(e.target.value); setJustSaved(false); }}
              rows={12}
              className="ui-input"
              style={{ lineHeight: 1.55, resize: 'vertical', minHeight: 220 }}
            />
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="ui-help">Add a detail:</span>
              {TAGS.map((t) => (
                <button key={t.tag} type="button" onClick={() => insertTag(t.tag)} className="ui-btn ui-btn-secondary ui-btn-sm">{t.label}</button>
              ))}
            </div>
            <p className="ui-help mt-2">Details like the shop name are filled in for each shop automatically when you send.</p>
          </div>

          <div>
            <p className="ui-label">Example for {SAMPLE_SHOP.name}</p>
            <div className="rounded-xl px-4 py-3 text-sm whitespace-pre-wrap" style={{ background: 'var(--ui-surface-2)', border: '1px solid var(--ui-border)', color: 'var(--ui-text)' }}>
              {fillTemplate(text, SAMPLE_SHOP).trim() || <span className="ui-muted">Your message is empty.</span>}
            </div>
            {template.includeFlyer && (
              <p className="ui-help mt-2 inline-flex items-center gap-1.5"><ImageIcon className="h-4 w-4" aria-hidden="true" />This message is sent with our flyer image.</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-t" style={{ borderColor: 'var(--ui-border)' }}>
          {isCustom || dirty ? (
            <button type="button" onClick={backToOriginal} className="ui-btn ui-btn-ghost ui-btn-sm">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Back to the original
            </button>
          ) : null}
          <span className="flex-1" />
          {justSaved && (
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--ui-success)' }} role="status">
              <Check className="h-4 w-4" aria-hidden="true" /> Saved
            </span>
          )}
          <button type="button" onClick={onClose} className="ui-btn ui-btn-secondary">Close</button>
          <button type="button" onClick={save} disabled={!dirty} className="ui-btn ui-btn-primary">
            <Save className="h-4 w-4" aria-hidden="true" />
            Save changes
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The "Templates" page: open a message template, change its text, and it is saved for every message you send. */
export default function TemplatesPage() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(null);       // the template being edited
  const [, setTick] = useState(0);              // redraw the cards when saved wording changes

  useEffect(() => {
    syncSavedMessages().then(() => setTick((n) => n + 1));
  }, []);

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--ui-bg)' }}>
      <Navbar />

      <main className="flex-1 flex flex-col tpl-page">
        <section className="finder-hero results-hero wa-hero">
          <div className="finder-hero-inner results-hero-row">
            <div className="min-w-0">
              <button type="button" className="tpl-back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/shops'))}>
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back
              </button>
              <h1>Message templates</h1>
              <p>Open a template, change its words, and your version is used the next time you send.</p>
            </div>
          </div>
        </section>

        <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-6">
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4" role="list">
            {WHATSAPP_TEMPLATES.map((t) => {
              const Icon = ICONS[t.id] || FileText;
              const saved = getSavedMessage(t.id);
              const preview = fillTemplate(saved || t.body, SAMPLE_SHOP).split('\n').filter(Boolean).slice(0, 4).join(' ');
              return (
                <li key={t.id}>
                  <button type="button" onClick={() => setOpen(t)} className="ui-card ui-card-hover w-full h-full text-left p-5 flex gap-3">
                    <span className="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center" style={{ background: 'var(--ui-primary-soft)', color: 'var(--ui-primary-text)' }} aria-hidden="true">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="block font-semibold" style={{ color: 'var(--ui-text)' }}>{t.name}</span>
                        {saved && <span className="ui-badge ui-badge-info">Edited</span>}
                      </span>
                      <span className="block text-sm mt-0.5" style={{ color: 'var(--ui-text-2)' }}>{t.tagline}</span>
                      <span className="block text-sm mt-2 line-clamp-4" style={{ color: 'var(--ui-muted)' }}>{preview}</span>
                      <span className="inline-flex items-center gap-1.5 mt-3 text-sm font-semibold" style={{ color: 'var(--ui-primary-text)' }}>
                        <Pencil className="h-4 w-4" aria-hidden="true" /> Open and edit
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </main>

      <Footer />
      {open && <TemplateEditor key={open.id} template={open} onClose={() => setOpen(null)} onSaved={() => setTick((n) => n + 1)} />}
    </div>
  );
}
