// src/lib/theme.js
// Accent and sizing preferences, applied as CSS custom properties.

import { useEffect } from 'react';

// Warm amber leads: a link light on a network switch, and a deliberate
// temperature contrast against the cool ink of the interface.
export const ACCENTS = [
  { label: 'Amber',  value: '#F5A524', hover: '#D98B12', light: '#FFCE7A', ink: '#1A1204' },
  { label: 'Cyan',   value: '#22D3EE', hover: '#0EA5BE', light: '#A5F3FC', ink: '#04191D' },
  { label: 'Lime',   value: '#A3E635', hover: '#84CC16', light: '#D9F99D', ink: '#141A05' },
  { label: 'Coral',  value: '#FB7185', hover: '#E11D48', light: '#FDA4AF', ink: '#1F0508' },
  { label: 'Violet', value: '#A78BFA', hover: '#8B5CF6', light: '#DDD6FE', ink: '#120A22' },
  { label: 'Blue',   value: '#60A5FA', hover: '#3B82F6', light: '#BFDBFE', ink: '#04101F' },
  { label: 'Green',  value: '#34D399', hover: '#10B981', light: '#A7F3D0', ink: '#04160F' },
  { label: 'Red',    value: '#F87171', hover: '#EF4444', light: '#FECACA', ink: '#1F0606' },
];

export const CARD_SIZES = [
  { label: 'Small',  w: '144px', h: '212px' },
  { label: 'Medium', w: '176px', h: '256px' },
  { label: 'Large',  w: '210px', h: '304px' },
];

export const TMDB_LANGS = [
  { label: 'English',  value: 'en-US' },
  { label: 'Bengali',  value: 'bn-BD' },
  { label: 'Hindi',    value: 'hi-IN' },
  { label: 'French',   value: 'fr-FR' },
  { label: 'German',   value: 'de-DE' },
  { label: 'Spanish',  value: 'es-ES' },
  { label: 'Japanese', value: 'ja-JP' },
  { label: 'Korean',   value: 'ko-KR' },
  { label: 'Chinese',  value: 'zh-CN' },
];

function hexToRgba(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Push saved preferences into CSS custom properties on :root. */
export function applyTheme() {
  const root = document.documentElement;

  const saved  = localStorage.getItem('accent_color') || ACCENTS[0].value;
  const accent = ACCENTS.find(a => a.value === saved) || ACCENTS[0];
  root.style.setProperty('--accent',       accent.value);
  root.style.setProperty('--accent-hover', accent.hover);
  root.style.setProperty('--accent-light', accent.light);
  root.style.setProperty('--accent-ink',   accent.ink);
  root.style.setProperty('--accent-dim',   hexToRgba(accent.value, 0.14));

  const sizeName = localStorage.getItem('card_size') || 'Medium';
  const size = CARD_SIZES.find(s => s.label === sizeName) || CARD_SIZES[1];
  root.style.setProperty('--card-width',  size.w);
  root.style.setProperty('--card-height', size.h);
}

export function useTheme() {
  useEffect(() => { applyTheme(); }, []);
}
