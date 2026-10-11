import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

/**
 * A dropdown that looks like the rest of the app (the browser's own list cannot be styled).
 * Works with mouse, touch and keyboard: Enter / Space / arrow keys open it, arrows move, Enter chooses, Escape closes.
 *
 * options: [{ value, label }]   value: the chosen value   onChange(value)
 */
export default function SelectMenu({ id, value, onChange, options, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef(null);
  const listRef = useRef(null);

  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [open]);

  // keep the highlighted row in view while moving with the arrow keys
  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const openMenu = () => { setActive(selectedIndex); setOpen(true); };
  const choose = (option) => { onChange(option.value); setOpen(false); };

  const onKeyDown = (e) => {
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); openMenu(); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, options.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (options[active]) choose(options[active]); }
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div className="sm-root" ref={rootRef}>
      <button
        type="button"
        id={id}
        className="sm-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className="sm-value">{selected?.label}</span>
        <ChevronDown className={`h-4 w-4 sm-chevron ${open ? 'is-open' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <ul className="sm-menu" role="listbox" ref={listRef} aria-label={ariaLabel}>
          {options.map((o, i) => {
            const isSelected = o.value === value;
            return (
              <li
                key={o.value}
                data-index={i}
                role="option"
                aria-selected={isSelected}
                className={`sm-option ${isSelected ? 'is-selected' : ''} ${active === i ? 'is-active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => { e.preventDefault(); choose(o); }}
              >
                <span>{o.label}</span>
                {isSelected && <Check className="h-4 w-4" aria-hidden="true" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
