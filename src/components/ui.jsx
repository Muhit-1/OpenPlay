// src/components/ui.jsx
// Shared primitives. Icons come from lucide-react — no emoji anywhere in the UI.

import { Star, Loader2, AlertTriangle } from 'lucide-react';

/**
 * The status chip — OpenPlay's signature element.
 *
 * A streaming service can only tell you what it offers. OpenPlay is pointed at
 * a real machine with a real filesystem, so it can tell you the truth: whether
 * this exact file is on your server, what it is, and whether it will play in
 * this browser. Set in mono so it reads as machine output, not marketing.
 *
 * @param {'on'|'off'|'checking'|'blocked'|'no-audio'|'unknown'} status
 * @param {string} [detail]  e.g. "1080P · MKV · HEVC · 10-BIT"
 */
export function StatusChip({ status, detail, className = '' }) {
  const variants = {
    on:         { cls: 'chip-on',      label: 'On server' },
    off:        { cls: 'chip-off',     label: 'Not on server' },
    checking:   { cls: 'chip-pending', label: 'Checking' },
    blocked:    { cls: 'chip-error',   label: 'Needs VLC' },
    'no-audio': { cls: 'chip-warn',    label: 'No audio' },
    unknown:    { cls: 'chip-off',     label: 'Unknown' },
  };

  const variant = variants[status] || variants.unknown;

  return (
    <span className={`chip ${variant.cls} ${className}`}>
      {status === 'checking'
        ? <Loader2 size={10} className="animate-spin" aria-hidden="true" />
        : <span className="chip-dot" aria-hidden="true" />}
      <span>{variant.label}</span>
      {detail && (
        <>
          <span aria-hidden="true" style={{ color: 'var(--text-faint)' }}>·</span>
          <span style={{ color: 'var(--text-dim)' }}>{detail}</span>
        </>
      )}
    </span>
  );
}

export function Rating({ value, size = 'sm' }) {
  if (!value) return null;
  const px = size === 'sm' ? 10 : 12;

  return (
    <span
      className="inline-flex items-center gap-1 mono font-medium"
      style={{ fontSize: px + 1, color: 'var(--accent-light)' }}
    >
      <Star size={px} fill="currentColor" strokeWidth={0} aria-hidden="true" />
      {value}
    </span>
  );
}

export function Spinner({ size = 16, label }) {
  return (
    <span className="inline-flex items-center gap-2" style={{ color: 'var(--text-dim)' }}>
      <Loader2 size={size} className="animate-spin" aria-hidden="true" />
      {label && <span className="text-sm">{label}</span>}
    </span>
  );
}

/**
 * A heading with an optional quiet note beside it ("English Movies · on your
 * server"). The note follows the heading on the same line; it never sits above
 * it as a label.
 */
export function SectionHeader({ hint, title, action, children, as: Tag = 'h2' }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4">
      <div className="min-w-0">
        <div className="flex items-baseline gap-3 min-w-0">
          <Tag className="font-display text-xl leading-tight truncate" style={{ color: 'var(--text)' }}>
            {title}
          </Tag>
          {hint && (
            <span className="hidden sm:inline text-[13px] flex-shrink-0" style={{ color: 'var(--text-faint)' }}>{hint}</span>
          )}
        </div>
        {children}
      </div>
      {action}
    </div>
  );
}

/**
 * An <img> that sharpens in once loaded, over whatever is beneath it (usually a
 * skeleton). Class toggling is done on the element so a cached image that has
 * already loaded before React attached `onLoad` still appears.
 */
export function FadeImg({ className = '', alt = '', ...props }) {
  const mark = el => { if (el && el.complete && el.naturalWidth > 0) el.classList.add('is-loaded'); };
  return (
    <img
      ref={mark}
      alt={alt}
      draggable={false}
      {...props}
      onLoad={e => { e.currentTarget.classList.add('is-loaded'); props.onLoad?.(e); }}
      className={`fade-img ${className}`}
    />
  );
}

/** What a route shows while its code loads: the shape of a page, not a spinner. */
export function PageSkeleton() {
  return (
    <div className="page-load px-5 sm:px-7 py-7" role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="skeleton h-8 w-48 rounded-lg mb-8" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 8 }, (_, i) => <PosterSkeleton key={i} />)}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint, action }) {
  return (
    <div className="flex flex-col items-center text-center py-20 px-6">
      {Icon && (
        <div
          className="w-11 h-11 rounded-full flex items-center justify-center mb-4"
          style={{ background: 'var(--ink-850)', border: '1px solid var(--line)' }}
        >
          <Icon size={18} style={{ color: 'var(--text-dim)' }} aria-hidden="true" />
        </div>
      )}
      <p className="font-display text-lg mb-1">{title}</p>
      {hint && <p className="text-sm max-w-sm" style={{ color: 'var(--text-dim)' }}>{hint}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Notice({ tone = 'warn', title, children, action }) {
  const tones = {
    warn:  'var(--warn)',
    error: 'var(--error)',
    info:  'var(--text-dim)',
  };
  const color = tones[tone] || tones.info;

  return (
    <div
      className="flex items-start gap-3 rounded-xl px-4 py-3"
      style={{
        background: `color-mix(in srgb, ${color} 8%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 28%, transparent)`,
      }}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      <AlertTriangle size={16} style={{ color, flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="text-sm font-semibold" style={{ color }}>{title}</p>}
        {children && (
          <div className="text-sm mt-0.5" style={{ color: 'var(--text-soft)' }}>{children}</div>
        )}
      </div>
      {action}
    </div>
  );
}

export function PosterSkeleton({ className = '' }) {
  return (
    <div className={`video-card flex-shrink-0 ${className}`}>
      <div className="skeleton video-card-poster rounded-[10px]" />
      <div className="pt-2.5 space-y-1.5">
        <div className="skeleton h-3 rounded" />
        <div className="skeleton h-2.5 w-1/2 rounded" />
      </div>
    </div>
  );
}
