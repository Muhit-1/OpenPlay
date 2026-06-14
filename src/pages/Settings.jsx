// src/pages/Settings.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// ── Accent color palette ──────────────────────────────────────────────────
const ACCENTS = [
  { label: 'Red',     value: '#dc2626', hover: '#b91c1c', light: '#fca5a5', dim: 'rgba(220,38,38,0.15)' },
  { label: 'Blue',    value: '#2563eb', hover: '#1d4ed8', light: '#93c5fd', dim: 'rgba(37,99,235,0.15)' },
  { label: 'Purple',  value: '#7c3aed', hover: '#6d28d9', light: '#c4b5fd', dim: 'rgba(124,58,237,0.15)' },
  { label: 'Green',   value: '#16a34a', hover: '#15803d', light: '#86efac', dim: 'rgba(22,163,74,0.15)' },
  { label: 'Orange',  value: '#ea580c', hover: '#c2410c', light: '#fdba74', dim: 'rgba(234,88,12,0.15)' },
  { label: 'Pink',    value: '#db2777', hover: '#be185d', light: '#f9a8d4', dim: 'rgba(219,39,119,0.15)' },
  { label: 'Teal',    value: '#0d9488', hover: '#0f766e', light: '#5eead4', dim: 'rgba(13,148,136,0.15)' },
  { label: 'Amber',   value: '#d97706', hover: '#b45309', light: '#fcd34d', dim: 'rgba(217,119,6,0.15)'  },
];

const TMDB_LANGS = [
  { label: 'English',    value: 'en-US' },
  { label: 'Bengali',    value: 'bn-BD' },
  { label: 'Hindi',      value: 'hi-IN' },
  { label: 'French',     value: 'fr-FR' },
  { label: 'German',     value: 'de-DE' },
  { label: 'Spanish',    value: 'es-ES' },
  { label: 'Japanese',   value: 'ja-JP' },
  { label: 'Korean',     value: 'ko-KR' },
  { label: 'Chinese',    value: 'zh-CN' },
];

const CARD_SIZES = [
  { label: 'Small',   cardW: '140px', cardH: '210px' },
  { label: 'Medium',  cardW: '176px', cardH: '256px' },
  { label: 'Large',   cardW: '208px', cardH: '300px' },
];

/** Apply accent + card size CSS vars to :root */
export function applyTheme() {
  const accentKey = localStorage.getItem('accent_color') || '#dc2626';
  const ac = ACCENTS.find(a => a.value === accentKey) || ACCENTS[0];
  document.documentElement.style.setProperty('--accent',       ac.value);
  document.documentElement.style.setProperty('--accent-hover', ac.hover);
  document.documentElement.style.setProperty('--accent-light', ac.light);
  document.documentElement.style.setProperty('--accent-dim',   ac.dim);

  const sizeKey = localStorage.getItem('card_size') || 'Medium';
  const sz = CARD_SIZES.find(s => s.label === sizeKey) || CARD_SIZES[1];
  document.documentElement.style.setProperty('--card-width',  sz.cardW);
  document.documentElement.style.setProperty('--card-height', sz.cardH);
}

export default function Settings() {
  const navigate = useNavigate();

  const [ispUrl,     setIspUrl]     = useState(localStorage.getItem('isp_url') || '');
  const [testing,    setTesting]    = useState(false);
  const [testMsg,    setTestMsg]    = useState(null);
  const [saved,      setSaved]      = useState(false);
  const [extraUrls,  setExtraUrls]  = useState(() => {
    try { return JSON.parse(localStorage.getItem('extra_urls') || '[]'); } catch { return []; }
  });
  const [newUrl, setNewUrl] = useState('');

  // Appearance
  const [accentColor, setAccentColor] = useState(localStorage.getItem('accent_color') || '#dc2626');
  const [cardSize,    setCardSize]    = useState(localStorage.getItem('card_size')    || 'Medium');
  const [tmdbLang,    setTmdbLang]    = useState(localStorage.getItem('tmdb_lang')    || 'en-US');

  // Apply theme on any change
  useEffect(() => {
    localStorage.setItem('accent_color', accentColor);
    localStorage.setItem('card_size',    cardSize);
    localStorage.setItem('tmdb_lang',    tmdbLang);
    applyTheme();
  }, [accentColor, cardSize, tmdbLang]);

  const handleTest = async () => {
    if (!ispUrl.trim()) return;
    setTesting(true);
    setTestMsg(null);
    try {
      const res  = await fetch(`/api/proxy?url=${encodeURIComponent(ispUrl.trim())}`);
      if (res.ok) {
        const text = await res.text();
        setTestMsg(text.includes('<a ')
          ? { ok: true,  text: 'Server reached — directory listing detected.' }
          : { ok: true,  text: 'Server reached, but no directory links found.' });
      } else {
        setTestMsg({ ok: false, text: `Server returned HTTP ${res.status}.` });
      }
    } catch (err) {
      setTestMsg({ ok: false, text: `Could not connect: ${err.message}` });
    } finally { setTesting(false); }
  };

  const handleSave = () => {
    const url = ispUrl.trim().endsWith('/') ? ispUrl.trim() : ispUrl.trim() + '/';
    localStorage.setItem('isp_url',    url);
    localStorage.setItem('extra_urls', JSON.stringify(extraUrls));
    setSaved(true);
    setTimeout(() => { setSaved(false); navigate('/'); }, 1200);
  };

  const handleClear = () => {
    localStorage.removeItem('isp_url');
    localStorage.removeItem('extra_urls');
    setIspUrl(''); setExtraUrls([]); setTestMsg(null);
  };

  const handleAddUrl = () => {
    if (!newUrl.trim()) return;
    const url = newUrl.trim().endsWith('/') ? newUrl.trim() : newUrl.trim() + '/';
    setExtraUrls(prev => [...prev, url]);
    setNewUrl('');
  };

  const inputClass = "w-full bg-zinc-800 text-white text-sm rounded-xl px-4 py-3 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] placeholder-zinc-600 font-mono";

  return (
    <div className="min-h-screen bg-zinc-950 pt-20 pb-12 px-6 max-w-2xl mx-auto page-enter">

      <h1 className="text-white text-3xl font-bold mb-1">Settings</h1>
      <p className="text-zinc-500 mb-10 text-sm">Server connection, appearance, and metadata preferences.</p>

      {/* ── Server URL ── */}
      <Section title="Primary Server URL" hint={`Your ISP's open HTTP directory — e.g. http://172.16.50.12/DHAKA-FLIX-12/`}>
        <input
          id="isp-url" type="url" value={ispUrl}
          onChange={e => { setIspUrl(e.target.value); setTestMsg(null); setSaved(false); }}
          placeholder="http://172.16.50.12/DHAKA-FLIX-12/"
          className={inputClass}
        />
        {testMsg && (
          <p className={`mt-3 text-sm rounded-lg px-4 py-2.5 ${testMsg.ok ? 'bg-green-900/30 text-green-300 border border-green-800/50' : 'bg-red-900/30 text-red-300 border border-red-800/50'}`}>
            {testMsg.ok ? '✓ ' : '✗ '}{testMsg.text}
          </p>
        )}
        <div className="flex gap-3 mt-4 flex-wrap">
          <button onClick={handleTest} disabled={!ispUrl.trim() || testing}
            className="flex items-center gap-2 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 text-white text-sm font-medium px-5 py-2.5 rounded-xl transition-colors">
            {testing ? <><span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin inline-block" /> Testing…</> : 'Test connection'}
          </button>
          <button onClick={handleSave} disabled={!ispUrl.trim() || saved}
            className="bg-[var(--accent)] hover:bg-[var(--accent-hover)] disabled:opacity-40 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors">
            {saved ? '✓ Saved!' : 'Save & go home'}
          </button>
          {ispUrl && (
            <button onClick={handleClear} className="text-zinc-500 hover:text-red-400 text-sm transition-colors px-2">
              Clear all
            </button>
          )}
        </div>
      </Section>

      {/* ── Additional URLs ── */}
      <Section title="Additional Server URLs" hint="Add more server IPs if your ISP has content spread across multiple servers.">
        <div className="flex gap-2 mb-3">
          <input type="url" value={newUrl}
            onChange={e => setNewUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddUrl()}
            placeholder="http://172.16.50.14/DHAKA-FLIX-14/"
            className={inputClass + ' flex-1'} />
          <button onClick={handleAddUrl}
            className="bg-zinc-700 hover:bg-zinc-600 text-white text-sm px-4 py-2 rounded-xl transition-colors">
            Add
          </button>
        </div>
        {extraUrls.length === 0 ? (
          <p className="text-zinc-600 text-xs italic">No additional servers added.</p>
        ) : (
          extraUrls.map((url, i) => (
            <div key={i} className="flex items-center justify-between bg-zinc-800 rounded-lg px-4 py-2 mb-2">
              <span className="text-zinc-300 text-sm font-mono truncate">{url}</span>
              <button onClick={() => setExtraUrls(prev => prev.filter((_, j) => j !== i))}
                className="text-zinc-500 hover:text-red-400 ml-3 text-xs flex-shrink-0 transition-colors">
                Remove
              </button>
            </div>
          ))
        )}
      </Section>

      {/* ── Appearance ── */}
      <Section title="Appearance">
        {/* Accent colour */}
        <div className="mb-6">
          <p className="text-zinc-400 text-xs mb-3">Accent colour</p>
          <div className="flex flex-wrap gap-3">
            {ACCENTS.map(ac => (
              <button
                key={ac.value}
                onClick={() => setAccentColor(ac.value)}
                title={ac.label}
                className={`w-8 h-8 rounded-full transition-all ring-offset-2 ring-offset-zinc-950
                  ${accentColor === ac.value ? 'ring-2 ring-white scale-110' : 'hover:scale-105 ring-0'}`}
                style={{ background: ac.value }}
              />
            ))}
          </div>
          <p className="text-zinc-600 text-xs mt-2">
            Current: <span className="font-semibold" style={{ color: accentColor }}>
              {ACCENTS.find(a => a.value === accentColor)?.label || accentColor}
            </span>
          </p>
        </div>

        {/* Card size */}
        <div className="mb-2">
          <p className="text-zinc-400 text-xs mb-3">Poster card size</p>
          <div className="flex gap-3">
            {CARD_SIZES.map(sz => (
              <button
                key={sz.label}
                onClick={() => setCardSize(sz.label)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all border ${
                  cardSize === sz.label
                    ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500'
                }`}
              >
                {sz.label}
              </button>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Metadata preferences ── */}
      <Section title="Metadata Language" hint="Language for TMDB movie titles, overviews, and posters.">
        <div className="flex flex-wrap gap-2">
          {TMDB_LANGS.map(lang => (
            <button
              key={lang.value}
              onClick={() => setTmdbLang(lang.value)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-all border ${
                tmdbLang === lang.value
                  ? 'bg-[var(--accent)] border-[var(--accent)] text-white'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-zinc-500'
              }`}
            >
              {lang.label}
            </button>
          ))}
        </div>
        <p className="text-zinc-600 text-xs mt-2">
          Changes take effect on next browse — clears the metadata cache.
        </p>
      </Section>

      {/* ── Info ── */}
      <section className="bg-zinc-900 rounded-2xl p-6 space-y-3 text-sm border border-zinc-800">
        <h2 className="text-white font-semibold text-base">How it works</h2>
        <p className="text-zinc-400">
          OpenPlay reads your ISP's open directory, enriches each file with TMDB metadata and posters,
          and streams video directly from your server — nothing passes through this app's backend.
          Watch progress is saved via Firebase.
        </p>
        <p className="text-zinc-500 text-xs">
          Metadata by{' '}
          <a href="https://www.themoviedb.org" target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline">
            TMDB
          </a>
          . Not endorsed or certified by TMDB.
        </p>
      </section>
    </div>
  );
}

function Section({ title, hint, children }) {
  return (
    <section className="mb-8">
      <h2 className="text-zinc-200 text-sm font-semibold mb-1">{title}</h2>
      {hint && <p className="text-zinc-500 text-xs mb-3">{hint}</p>}
      {children}
    </section>
  );
}