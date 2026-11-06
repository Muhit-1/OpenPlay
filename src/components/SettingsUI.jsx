// src/components/SettingsUI.jsx
//
// The pieces the Settings page is built from. A setting is a row: what it does
// on the left, the control on the right, one plain sentence between them.

import { createContext, useContext, useId, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { SettingsQuery } from './settingsQuery';

const matches = (query, text) => !query || String(text).toLowerCase().includes(query);

/** One section of the page. Hides itself when a search matches nothing inside. */
export function SetCard({ id, title, description, status, action, keywords = '', children }) {
  const query = useContext(SettingsQuery);
  const titleHit = matches(query, title) && Boolean(query);
  if (query && !titleHit && !matches(query, keywords)) return null;

  return (
    <section id={id} className="mb-7" style={{ scrollMarginTop: 96 }}>
      <TitleHit.Provider value={titleHit}>
        <div className="set-card">
          <div className="set-head">
            <div className="min-w-0">
              <h2 className="font-display text-[20px] leading-tight">{title}</h2>
              {description && (
                <p className="text-[14px] mt-1 max-w-[52ch]" style={{ color: 'var(--text-dim)' }}>{description}</p>
              )}
            </div>
            <div className="flex items-center gap-2.5 flex-shrink-0">
              {status}
              {action}
            </div>
          </div>
          {children}
        </div>
      </TitleHit.Provider>
    </section>
  );
}

const TitleHit = createContext(false);

/** A setting. `stack` puts the control under the text instead of beside it. */
export function SetRow({ title, description, keywords = '', stack = false, children }) {
  const query = useContext(SettingsQuery);
  const titleHit = useContext(TitleHit);
  if (query && !titleHit && !matches(query, `${title} ${description || ''} ${keywords}`)) return null;

  return (
    <div className={`set-row ${stack ? 'is-stack' : ''}`}>
      <div className="min-w-0">
        <p className="text-[15px] font-semibold">{title}</p>
        {description && (
          <p className="text-[13.5px] mt-0.5 max-w-[56ch]" style={{ color: 'var(--text-dim)' }}>{description}</p>
        )}
      </div>
      <div className={stack ? '' : 'flex items-center justify-end gap-2.5 min-w-0'}>{children}</div>
    </div>
  );
}

export function StatusPill({ tone = 'ok', children }) {
  return <span className={`status is-${tone}`}>{children}</span>;
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="tgl"
    />
  );
}

/** One of a few choices, as a segmented control. */
export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          style={{ height: 36, padding: '0 14px' }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Swatches({ value, onChange, options, label }) {
  return (
    <div className="flex flex-wrap justify-end gap-2.5" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          aria-label={o.label}
          title={o.label}
          className="swatch"
          style={{ '--c': o.value }}
          onClick={() => onChange(o.value)}
        >
          <Check size={14} strokeWidth={3} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

/** A text field made of chips: Enter adds one, Backspace removes the last. */
export function TagInput({ values, onChange, placeholder, label }) {
  const [text, setText] = useState('');
  const input = useRef(null);

  const add = () => {
    const next = text.trim();
    if (!next) return;
    if (!values.includes(next)) onChange([...values, next]);
    setText('');
  };

  return (
    <label className="well tag-well" onClick={() => input.current?.focus()}>
      {values.map((v, i) => (
        <span key={v} className="tag-chip">
          {v}
          <button
            type="button"
            aria-label={`Remove ${v}`}
            onClick={e => { e.preventDefault(); e.stopPropagation(); onChange(values.filter((_, j) => j !== i)); }}
          >
            <X size={12} aria-hidden="true" />
          </button>
        </span>
      ))}
      <input
        ref={input}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); add(); }
          else if (e.key === 'Backspace' && !text && values.length) onChange(values.slice(0, -1));
        }}
        onBlur={add}
        placeholder={values.length ? '' : placeholder}
        aria-label={label}
        spellCheck={false}
      />
    </label>
  );
}

/** A text field with an icon, a state and a line of feedback beneath it. */
export function Field({ icon: Icon, tone, hint, hintTone, inputProps, trailing }) {
  const hintId = useId();
  return (
    <div className="min-w-0 flex-1">
      <label className={`well ${tone === 'ok' ? 'is-ok' : tone === 'bad' ? 'is-bad' : ''}`}>
        {Icon && <Icon size={17} className="well-icon" aria-hidden="true" />}
        <input {...inputProps} aria-describedby={hint ? hintId : undefined} />
        {trailing}
      </label>
      <p id={hintId} className={`field-hint ${hintTone ? `is-${hintTone}` : ''}`} role={hintTone === 'bad' ? 'alert' : 'status'}>
        {hint}
      </p>
    </div>
  );
}

/** Appears when there is something to save. */
export function SaveBar({ count, onSave, onDiscard, saving }) {
  if (!count) return null;
  return (
    <div className="save-bar" role="status">
      <span className="w-2 h-2 rounded-full" style={{ background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)' }} aria-hidden="true" />
      <span className="text-[14.5px] font-medium">{count} unsaved change{count === 1 ? '' : 's'}</span>
      <button type="button" onClick={onDiscard} className="px-3 h-8 rounded-lg text-[13.5px] font-semibold" style={{ color: 'var(--text-soft)' }}>
        Discard
      </button>
      <button type="button" onClick={onSave} disabled={saving} className="btn-accent px-4 h-10 rounded-[10px] text-[14px] disabled:opacity-50">
        Save changes
      </button>
    </div>
  );
}
