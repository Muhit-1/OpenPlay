// src/components/FilterMenu.jsx
//
// A labelled dropdown: "LIBRARY  English Movies ▾". Replaces rows of chips where
// the choice is one-of-many and the list can be long.

import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';

/**
 * @param {string} label       small caption, e.g. "Library"
 * @param {string} value       what is selected now
 * @param {boolean} [block]    fill the width (used inside side panels)
 * @param {(api:{close:()=>void}) => React.ReactNode} children  menu content
 */
export default function FilterMenu({ label, value, block = false, children }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (!root.current?.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className={`relative ${block ? 'w-full' : ''}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={`control flex items-center gap-2.5 h-10 pl-3.5 pr-3 text-[14.5px] ${block ? 'w-full justify-between' : ''}`}
        style={{ borderColor: open ? 'var(--accent)' : undefined }}
      >
        <span className="flex items-center gap-2.5 min-w-0">
          {label && (
            <span className="eyebrow flex-shrink-0" style={{ fontSize: 10.5, color: 'var(--text-faint)' }}>
              {label}
            </span>
          )}
          <span className="font-semibold truncate max-w-[240px]">{value}</span>
        </span>
        <ChevronDown size={16} style={{ color: 'var(--text-dim)' }} aria-hidden="true" />
      </button>

      {open && (
        <div
          id={menuId}
          role="listbox"
          className="popover"
          style={block ? { left: 0, right: 0 } : undefined}
        >
          {typeof children === 'function' ? children({ close: () => setOpen(false) }) : children}
        </div>
      )}
    </div>
  );
}

/** One row in a FilterMenu. */
export function MenuItem({ selected, onClick, hint, dot, children }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={!!selected}
      onClick={onClick}
      className="menu-item"
    >
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
      {selected
        ? <Check size={15} style={{ color: 'var(--accent)' }} aria-hidden="true" />
        : hint != null && <span className="mono text-[12px]" style={{ color: 'var(--text-faint)' }}>{hint}</span>}
    </button>
  );
}

/** A switch with a label, e.g. "Play next automatically". */
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
