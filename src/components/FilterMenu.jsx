// src/components/FilterMenu.jsx
//
// A labelled dropdown: "LIBRARY  English Movies ▾". One-of-many or many-of-many,
// optionally searchable, fully keyboard driven. It tints when it is filtering
// something, so a glance at the bar says what is narrowed.

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';

/**
 * @param {string} label        small caption, e.g. "Library"
 * @param {string} value        what is selected now
 * @param {boolean} [active]    tint the trigger (a non-default choice is applied)
 * @param {boolean} [block]     fill the width (used inside side panels)
 * @param {boolean} [right]     open towards the left, for controls at the right edge
 * @param {string}  [searchable] placeholder for a search box inside the menu
 * @param {string}  [footer]    hint shown with a "Clear" button (many-of-many menus)
 * @param {() => void} [onClear]
 * @param {(api:{close:()=>void, query:string}) => React.ReactNode} children  menu content
 */
export default function FilterMenu({
  label, value, active = false, block = false, right = false,
  searchable, footer, onClear, children,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef(null);
  const trigger = useRef(null);
  const list = useRef(null);
  const kb = useRef(-1);
  const menuId = useId();

  const close = () => { setOpen(false); setQuery(''); };

  // A fresh menu starts with nothing highlighted.
  useEffect(() => { kb.current = -1; }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (!root.current?.contains(e.target)) { setOpen(false); setQuery(''); } };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Move the keyboard highlight among the options currently shown.
  const move = step => {
    const options = [...(list.current?.querySelectorAll('[role="option"]') || [])];
    if (!options.length) return;
    kb.current = Math.max(0, Math.min(options.length - 1, kb.current + step));
    options.forEach((o, i) => o.classList.toggle('is-kb', i === kb.current));
    options[kb.current]?.scrollIntoView({ block: 'nearest' });
  };

  const onKeyDown = e => {
    if (!open) {
      if (e.key === 'ArrowDown' && e.target === trigger.current) { e.preventDefault(); setOpen(true); }
      return;
    }
    if (e.key === 'Escape') { e.stopPropagation(); close(); trigger.current?.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter' && kb.current >= 0 && e.target.matches('input')) {
      e.preventDefault();
      list.current?.querySelectorAll('[role="option"]')[kb.current]?.click();
    }
  };

  return (
    <div ref={root} className={`relative ${block ? 'w-full' : ''}`} onKeyDown={onKeyDown}>
      <button
        ref={trigger}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={`trig ${active ? 'is-active' : ''} ${block ? 'is-block' : ''}`}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          {label && <span className="trig-k flex-shrink-0">{label}</span>}
          <span className="trig-v truncate">{value}</span>
        </span>
        <ChevronDown className="trig-chev" size={15} aria-hidden="true" />
      </button>

      {open && (
        <div
          id={menuId}
          className={`popover ${right ? 'is-right' : ''}`}
          style={block ? { left: 0, right: 0 } : undefined}
        >
          {searchable && (
            <div className="menu-search">
              <label className="well is-sm">
                <Search size={15} className="well-icon" aria-hidden="true" />
                <input
                  autoFocus
                  value={query}
                  onChange={e => { setQuery(e.target.value); kb.current = -1; }}
                  placeholder={searchable}
                  aria-label={searchable}
                />
              </label>
            </div>
          )}
          <div ref={list} role="listbox" aria-label={label}>
            {typeof children === 'function' ? children({ close, query }) : children}
          </div>
          {footer !== undefined && (
            <div className="menu-foot">
              <span>{footer}</span>
              {onClear && <button type="button" onClick={() => { onClear(); }}>Clear</button>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** One row in a FilterMenu. `check` shows a checkbox, for many-of-many menus. */
export function MenuItem({ selected, onClick, hint, dot, check = false, children }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={!!selected}
      onClick={onClick}
      className="menu-item"
    >
      {check && (
        <span className="menu-check" aria-hidden="true"><Check size={11} strokeWidth={3} /></span>
      )}
      {dot !== undefined && (
        <span
          className="chip-dot"
          aria-hidden="true"
          style={{
            color: dot ? 'var(--ok)' : 'var(--text-faint)',
            boxShadow: dot ? '0 0 6px var(--ok)' : 'none',
          }}
        />
      )}
      <span className="flex-1 min-w-0 truncate">{children}</span>
      {!check && selected
        ? <Check size={15} style={{ color: 'var(--accent)' }} aria-hidden="true" />
        : hint != null && <span className="mono text-[12px]" style={{ color: 'var(--text-faint)' }}>{hint}</span>}
    </button>
  );
}

/** A switch with a label, e.g. "Dark background". */
export function Switch({ checked, onChange, children }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="switch"
    >
      <span className="switch-track" aria-hidden="true" />
      {children}
    </button>
  );
}
