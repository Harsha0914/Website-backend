import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2, RefreshCw, Pencil, Check, X, Upload, Loader2, AlertCircle, Images } from 'lucide-react';
import { IMAGE_CATEGORIES, prepareImageFile } from '../../utils/imageTools';
import {
  listMessageImages, addMessageImage, changeMessageImage, deleteMessageImage, imageErrorText,
} from '../../services/messageImages';

export const FLYER_VALUE = { kind: 'flyer', label: 'EasyBillBro flyer (built-in)', thumb: '/images/easybillbro-flyer.jpg' };

/** The picture to show in a message preview for a picker value (or null for text only). */
export function pictureSrc(value) {
  if (!value) return null;
  return value.kind === 'flyer' ? FLYER_VALUE.thumb : value.thumb;
}

const asValue = (img) => ({ kind: 'library', id: img.id, label: img.label, thumb: img.thumb, category: img.category });

/**
 * One simple box to add, change, replace or remove the picture that goes with a message.
 * Pictures are kept in the account's own library, grouped by shop type, and the ones matching the message's
 * category are offered first.
 */
export default function MessageImagePicker({ value, onChange, category = 'General', onLibraryLoaded }) {
  const [images, setImages] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('suggested'); // 'suggested' | 'all'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(null);       // a freshly chosen file waiting for a name and category
  const [editingId, setEditingId] = useState(null);
  const [edit, setEdit] = useState({ label: '', category: 'General' });
  const addInput = useRef(null);
  const replaceInput = useRef(null);
  const replaceTarget = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await listMessageImages();
      setImages(data.images || []);
      if (onLibraryLoaded) onLibraryLoaded(data.images || []);
    } catch (err) {
      setError(imageErrorText(err));
    } finally {
      setLoaded(true);
    }
  }, [onLibraryLoaded]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const suggested = images.filter((i) => i.category === category);
  const shown = filter === 'suggested' ? suggested : images;

  const publish = (next) => {
    setImages(next);
    if (onLibraryLoaded) onLibraryLoaded(next);
  };

  // ── add a new picture ──
  const onAddFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const prepared = await prepareImageFile(file);
      setDraft({ ...prepared, label: prepared.name.slice(0, 60), category });
      setOpen(true);
    } catch (err) {
      setError(imageErrorText(err));
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async () => {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      const made = await addMessageImage({ category: draft.category, label: draft.label || 'My picture', dataUrl: draft.dataUrl, thumbUrl: draft.thumbUrl });
      publish([made, ...images]);
      onChange(asValue(made));
      setDraft(null);
      setOpen(false);
    } catch (err) {
      setError(imageErrorText(err));
    } finally {
      setBusy(false);
    }
  };

  // ── replace the file of an existing picture ──
  const startReplace = (id) => {
    replaceTarget.current = id;
    replaceInput.current?.click();
  };

  const onReplaceFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const id = replaceTarget.current;
    if (!file || !id) return;
    setError('');
    setBusy(true);
    try {
      const prepared = await prepareImageFile(file);
      const updated = await changeMessageImage(id, { dataUrl: prepared.dataUrl, thumbUrl: prepared.thumbUrl });
      publish(images.map((i) => (i.id === id ? updated : i)));
      if (value?.kind === 'library' && value.id === id) onChange(asValue(updated));
    } catch (err) {
      setError(imageErrorText(err));
    } finally {
      setBusy(false);
    }
  };

  // ── rename / move category ──
  const startEdit = (img) => {
    setEditingId(img.id);
    setEdit({ label: img.label, category: img.category });
  };

  const saveEdit = async (id) => {
    setBusy(true);
    setError('');
    try {
      const updated = await changeMessageImage(id, { label: edit.label, category: edit.category });
      publish(images.map((i) => (i.id === id ? updated : i)));
      if (value?.kind === 'library' && value.id === id) onChange(asValue(updated));
      setEditingId(null);
    } catch (err) {
      setError(imageErrorText(err));
    } finally {
      setBusy(false);
    }
  };

  const removeFromLibrary = async (img) => {
    if (!window.confirm(`Delete "${img.label}" from your pictures? This cannot be undone.`)) return;
    setBusy(true);
    setError('');
    try {
      await deleteMessageImage(img.id);
      publish(images.filter((i) => i.id !== img.id));
      if (value?.kind === 'library' && value.id === img.id) onChange(null);
      setEditingId(null);
    } catch (err) {
      setError(imageErrorText(err));
    } finally {
      setBusy(false);
    }
  };

  const choose = (next) => {
    onChange(next);
    setOpen(false);
    setError('');
  };

  const selectedLibraryImage = value?.kind === 'library' ? value : null;

  return (
    <section aria-label="Picture for this message" className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="ui-label" style={{ margin: 0 }}>Picture <span className="ui-muted">(optional)</span></p>
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-label="Working" style={{ color: 'var(--ui-muted)' }} />}
      </div>

      {/* what is attached right now */}
      {value ? (
        <div className="flex items-center gap-3 rounded-xl p-3" style={{ border: '1px solid var(--ui-border)', background: 'var(--ui-surface-2)' }}>
          <img src={pictureSrc(value)} alt="" className="rounded-lg shrink-0" style={{ width: 84, height: 84, objectFit: 'cover', border: '1px solid var(--ui-border)' }} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm truncate" style={{ color: 'var(--ui-text)' }}>{value.label}</p>
            <p className="ui-help">{value.kind === 'flyer' ? 'Built-in picture' : `${value.category || 'General'} picture`}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => { setOpen(true); setFilter('suggested'); }}>
                <Images className="h-4 w-4" aria-hidden="true" />
                Change picture
              </button>
              {selectedLibraryImage && (
                <button type="button" className="ui-btn ui-btn-secondary ui-btn-sm" onClick={() => startReplace(selectedLibraryImage.id)} disabled={busy}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Replace with a new file
                </button>
              )}
              <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => onChange(null)}>
                <X className="h-4 w-4" aria-hidden="true" />
                Remove from message
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl p-4 text-center" style={{ border: '2px dashed var(--ui-border-strong)' }}>
          <p className="text-sm" style={{ color: 'var(--ui-text-2)' }}>No picture. This message will be sent as text only.</p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => { setOpen(true); setFilter('suggested'); }}>
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
              Add a picture
            </button>
          </div>
        </div>
      )}

      {/* pictures that fit this kind of shop, one tap to use */}
      {loaded && !open && suggested.length > 0 && !(value?.kind === 'library' && suggested.some((i) => i.id === value.id) && suggested.length === 1) && (
        <div>
          <p className="ui-help" style={{ marginBottom: 6 }}>Suggested for {category}:</p>
          <div className="flex flex-wrap gap-2">
            {suggested.slice(0, 5).map((img) => {
              const active = value?.kind === 'library' && value.id === img.id;
              return (
                <button
                  key={img.id}
                  type="button"
                  aria-pressed={active}
                  title={img.label}
                  onClick={() => choose(asValue(img))}
                  className="rounded-lg overflow-hidden"
                  style={{ width: 64, height: 64, padding: 0, border: `2px solid ${active ? 'var(--ui-primary)' : 'var(--ui-border)'}`, background: 'transparent' }}
                >
                  <img src={img.thumb} alt={img.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* hidden file pickers */}
      <input ref={addInput} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={onAddFile} aria-label="Choose a picture to add" />
      <input ref={replaceInput} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={onReplaceFile} aria-label="Choose the new file" />

      {error && (
        <div className="ui-notice ui-notice-error" role="alert">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* the picture library */}
      {open && (
        <div className="rounded-xl p-3 space-y-3" style={{ border: '1px solid var(--ui-border)', background: 'var(--ui-surface)' }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Which pictures to show">
              <button type="button" className={`ui-chip ${filter === 'suggested' ? 'ui-chip-active' : ''}`} aria-pressed={filter === 'suggested'} onClick={() => setFilter('suggested')}>
                For {category} ({suggested.length})
              </button>
              <button type="button" className={`ui-chip ${filter === 'all' ? 'ui-chip-active' : ''}`} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
                All pictures ({images.length})
              </button>
            </div>
            <div className="flex gap-2">
              <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" onClick={() => addInput.current?.click()} disabled={busy}>
                <Upload className="h-4 w-4" aria-hidden="true" />
                Upload a new picture
              </button>
              <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => { setOpen(false); setDraft(null); setEditingId(null); }} aria-label="Close the picture list">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* a newly chosen file: name it and pick its category */}
          {draft && (
            <div className="rounded-xl p-3 flex flex-wrap gap-3 items-start" style={{ background: 'var(--ui-primary-soft)' }}>
              <img src={draft.thumbUrl} alt="Preview of the new picture" className="rounded-lg" style={{ width: 96, height: 96, objectFit: 'cover' }} />
              <div className="flex-1 min-w-[200px] space-y-2">
                <div>
                  <label htmlFor="img-label" className="ui-label">Name</label>
                  <input id="img-label" className="ui-input" value={draft.label} maxLength={80} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
                </div>
                <div>
                  <label htmlFor="img-cat" className="ui-label">For which kind of shop?</label>
                  <select id="img-cat" className="ui-select" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>
                    {IMAGE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="ui-btn ui-btn-success ui-btn-sm" onClick={saveDraft} disabled={busy}>
                    <Check className="h-4 w-4" aria-hidden="true" />
                    Save and use this picture
                  </button>
                  <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => setDraft(null)} disabled={busy}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3" role="list">
            {/* the built-in flyer is always available */}
            <li>
              <button
                type="button"
                aria-pressed={value?.kind === 'flyer'}
                onClick={() => choose(FLYER_VALUE)}
                className="w-full text-left rounded-xl overflow-hidden"
                style={{ border: `2px solid ${value?.kind === 'flyer' ? 'var(--ui-primary)' : 'var(--ui-border)'}`, background: 'var(--ui-surface-2)' }}
              >
                <img src={FLYER_VALUE.thumb} alt="" style={{ width: '100%', height: 110, objectFit: 'cover', objectPosition: 'top' }} />
                <span className="block px-2 py-1.5 text-xs font-semibold" style={{ color: 'var(--ui-text)' }}>{FLYER_VALUE.label}</span>
              </button>
            </li>
            {shown.map((img) => {
              const active = value?.kind === 'library' && value.id === img.id;
              const editing = editingId === img.id;
              return (
                <li key={img.id} className="rounded-xl overflow-hidden" style={{ border: `2px solid ${active ? 'var(--ui-primary)' : 'var(--ui-border)'}`, background: 'var(--ui-surface-2)' }}>
                  <button type="button" aria-pressed={active} onClick={() => choose(asValue(img))} className="w-full text-left" style={{ background: 'transparent' }}>
                    <img src={img.thumb} alt="" style={{ width: '100%', height: 110, objectFit: 'cover' }} />
                    <span className="block px-2 pt-1.5 text-xs font-semibold truncate" style={{ color: 'var(--ui-text)' }}>{img.label}</span>
                    <span className="block px-2 pb-1 text-[11px]" style={{ color: 'var(--ui-muted)' }}>{img.category}</span>
                  </button>
                  {!editing ? (
                    <div className="px-2 pb-2 flex gap-1">
                      <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => startEdit(img)} aria-label={`Edit ${img.label}`} title="Edit name or category">
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => startReplace(img.id)} aria-label={`Replace the file of ${img.label}`} title="Replace the picture file" disabled={busy}>
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => removeFromLibrary(img)} aria-label={`Delete ${img.label}`} title="Delete from my pictures" disabled={busy} style={{ color: 'var(--ui-danger)' }}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ) : (
                    <div className="px-2 pb-2 space-y-1.5">
                      <label className="sr-only" htmlFor={`el-${img.id}`}>Name</label>
                      <input id={`el-${img.id}`} className="ui-input" style={{ minHeight: 34, padding: '4px 8px', fontSize: 13 }} value={edit.label} maxLength={80} onChange={(e) => setEdit({ ...edit, label: e.target.value })} />
                      <label className="sr-only" htmlFor={`ec-${img.id}`}>Category</label>
                      <select id={`ec-${img.id}`} className="ui-select" style={{ minHeight: 34, padding: '4px 8px', fontSize: 13 }} value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>
                        {IMAGE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <div className="flex gap-1">
                        <button type="button" className="ui-btn ui-btn-success ui-btn-sm" onClick={() => saveEdit(img.id)} disabled={busy}>Save</button>
                        <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => setEditingId(null)}>Cancel</button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {loaded && shown.length === 0 && (
            <p className="text-sm text-center" style={{ color: 'var(--ui-muted)' }}>
              {filter === 'suggested'
                ? `You have no ${category} pictures yet. Upload one, or open "All pictures".`
                : 'You have not uploaded any pictures yet.'}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
