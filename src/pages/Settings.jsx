// src/pages/Settings.jsx

import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check, X, Trash2, Loader2, ExternalLink, Radar, Download,
  Clapperboard, Tv, Sparkles, MonitorPlay,
} from 'lucide-react';
import { clearMetaCache } from '../lib/tmdb';
import { ACCENTS, CARD_SIZES, TMDB_LANGS, applyTheme } from '../lib/theme';
import { discoverLibraries } from '../lib/discover';
import { getLibraries, saveLibraries } from '../lib/server';
import { downloadVlcRegistryFile, isVlcReady } from '../lib/vlc';
import { Notice } from '../components/ui';

const CATEGORY_ICON = {
  movies: Clapperboard,
  series: Tv,
  animation: Sparkles,
};

export default function Settings() {
  const navigate = useNavigate();

  const [portal, setPortal] = useState(() => localStorage.getItem('portal_url') || localStorage.getItem('isp_url') || '');
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState(null);
  const [libraries, setLibraries] = useState(() => getLibraries());
  const [saved, setSaved] = useState(false);

  const [accent, setAccent] = useState(() => localStorage.getItem('accent_color') || ACCENTS[0].value);
  const [cardSize, setCardSize] = useState(() => localStorage.getItem('card_size') || 'Medium');
  const [lang, setLang] = useState(() => localStorage.getItem('tmdb_lang') || 'en-US');

  useEffect(() => {
    localStorage.setItem('accent_color', accent);
    localStorage.setItem('card_size', cardSize);
    applyTheme();
  }, [accent, cardSize]);

  useEffect(() => {
    const previous = localStorage.getItem('tmdb_lang');
    localStorage.setItem('tmdb_lang', lang);
    if (previous && previous !== lang) clearMetaCache();
  }, [lang]);

  const discover = useCallback(async () => {
    setScanning(true);
    setScan(null);
    setSaved(false);

    const started = performance.now();
    const result = await discoverLibraries(portal);
    const ms = Math.round(performance.now() - started);

    if (result.error) {
      setScan({ ok: false, text: result.error });
    } else {
      setLibraries(result.libraries);
      setScan({
        ok: true,
        text: `Found ${result.libraries.length} libraries across ${
          new Set(result.libraries.map(l => l.host)).size
        } servers in ${ms} ms.`,
        warning: result.warning,
      });
    }
    setScanning(false);
  }, [portal]);

  const save = () => {
    const url = withTrailingSlash(portal.trim());
    localStorage.setItem('portal_url', url);
    localStorage.setItem('isp_url', url);
    saveLibraries(libraries);
    clearMetaCache();
    setSaved(true);
    setTimeout(() => navigate('/'), 700);
  };

  const clearAll = () => {
    ['portal_url', 'isp_url', 'extra_urls', 'libraries'].forEach(k => localStorage.removeItem(k));
    clearMetaCache();
    setPortal('');
    setLibraries([]);
    setScan(null);
  };

  const grouped = ['movies', 'series', 'animation'].map(category => ({
    category,
    items: libraries.filter(l => (l.category || 'movies') === category),
  })).filter(g => g.items.length);

  return (
    <div className="page-enter max-w-3xl mx-auto px-5 sm:px-7 py-10">
      <header className="mb-10">
        <p className="eyebrow mb-2">Configuration</p>
        <h1 className="font-display text-3xl mb-2">Settings</h1>
        <p className="text-[15px]" style={{ color: 'var(--text-dim)' }}>
          Connect your ISP's portal, then choose how the catalogue looks.
        </p>
      </header>

      <Section
        title="Server"
        hint="Give the portal address — the page with the menu of libraries. OpenPlay follows it to every server behind it."
      >
        <div className="flex gap-2">
          <input
            type="url"
            value={portal}
            onChange={e => { setPortal(e.target.value); setScan(null); setSaved(false); }}
            onKeyDown={e => e.key === 'Enter' && discover()}
            placeholder="http://172.16.50.12/"
            spellCheck={false}
            className="control flex-1 px-3.5 h-11 mono text-[15px] outline-none"
          />
          <button
            onClick={discover}
            disabled={!portal.trim() || scanning}
            className="control flex items-center gap-2 px-4 h-11 text-[15px] font-medium disabled:opacity-40"
          >
            {scanning ? <Loader2 size={15} className="animate-spin" /> : <Radar size={15} />}
            {scanning ? 'Scanning' : 'Find libraries'}
          </button>
        </div>

        {scan && (
          <p
            className="mt-3 flex items-start gap-2 text-[15px] rounded-lg px-3.5 py-2.5"
            style={{
              color: scan.ok ? 'var(--ok)' : 'var(--error)',
              background: `color-mix(in srgb, ${scan.ok ? 'var(--ok)' : 'var(--error)'} 9%, transparent)`,
              border: `1px solid color-mix(in srgb, ${scan.ok ? 'var(--ok)' : 'var(--error)'} 26%, transparent)`,
            }}
            role="status"
          >
            {scan.ok ? <Check size={16} className="mt-0.5 flex-shrink-0" /> : <X size={16} className="mt-0.5 flex-shrink-0" />}
            {scan.text}
          </p>
        )}

        {scan?.warning && (
          <div className="mt-2.5">
            <Notice tone="warn" title="Some servers did not answer">
              {scan.warning} They are kept in the list and marked offline — a server that is
              down now may be back later.
            </Notice>
          </div>
        )}

        {grouped.length > 0 && (
          <div className="mt-5 space-y-4">
            {grouped.map(group => {
              const Icon = CATEGORY_ICON[group.category];
              return (
                <div key={group.category}>
                  <p className="eyebrow flex items-center gap-1.5 mb-2">
                    <Icon size={12} aria-hidden="true" />
                    {group.category} · {group.items.length}
                  </p>
                  <ul className="space-y-1">
                    {group.items.map(lib => (
                      <li
                        key={lib.url}
                        className="control flex items-center gap-3 px-3.5 h-11"
                        style={{ opacity: lib.online === false ? 0.55 : 1 }}
                      >
                        <span
                          className="chip-dot flex-shrink-0"
                          style={{ color: lib.online === false ? 'var(--text-faint)' : 'var(--ok)' }}
                          aria-hidden="true"
                        />
                        <span className="text-[14px] truncate flex-1">{lib.label}</span>
                        {lib.online === false && <span className="data flex-shrink-0">Offline</span>}
                        <span className="data flex-shrink-0">{lib.quality}p</span>
                        <span className="mono text-[12px] flex-shrink-0" style={{ color: 'var(--text-faint)' }}>
                          {lib.host}
                        </span>
                        <button
                          onClick={() => setLibraries(prev => prev.filter(l => l.url !== lib.url))}
                          aria-label={`Remove ${lib.label}`}
                          style={{ color: 'var(--text-dim)' }}
                        >
                          <X size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap gap-2.5 mt-5">
          <button
            onClick={save}
            disabled={!portal.trim() || saved}
            className="btn-accent flex items-center gap-2 px-4 h-10 rounded-[10px] text-[15px] disabled:opacity-40"
          >
            {saved && <Check size={15} />}
            {saved ? 'Saved' : 'Save'}
          </button>
          {(portal || libraries.length > 0) && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1.5 px-3 h-10 text-[15px] rounded-[10px]"
              style={{ color: 'var(--text-dim)' }}
            >
              <Trash2 size={15} />
              Clear
            </button>
          )}
        </div>
      </Section>

      <VlcSection />

      <Section title="Accent">
        <div className="flex flex-wrap gap-2.5">
          {ACCENTS.map(a => (
            <button
              key={a.value}
              onClick={() => setAccent(a.value)}
              title={a.label}
              aria-label={a.label}
              aria-pressed={accent === a.value}
              className="w-9 h-9 rounded-lg transition-transform"
              style={{
                background: a.value,
                transform: accent === a.value ? 'scale(1.12)' : 'none',
                boxShadow: accent === a.value ? '0 0 0 2px var(--ink-950), 0 0 0 3px var(--text)' : 'none',
              }}
            />
          ))}
        </div>
      </Section>

      <Section title="Poster size">
        <div className="flex gap-2">
          {CARD_SIZES.map(s => (
            <Choice key={s.label} active={cardSize === s.label} onClick={() => setCardSize(s.label)}>
              {s.label}
            </Choice>
          ))}
        </div>
      </Section>

      <Section title="Metadata language" hint="Language for titles, summaries and posters from TMDB.">
        <div className="flex flex-wrap gap-2">
          {TMDB_LANGS.map(l => (
            <Choice key={l.value} active={lang === l.value} onClick={() => setLang(l.value)}>
              {l.label}
            </Choice>
          ))}
        </div>
      </Section>

      <section className="panel p-5 mt-10">
        <h2 className="font-display text-base mb-2">How this works</h2>
        <p className="text-[15px] leading-relaxed" style={{ color: 'var(--text-soft)' }}>
          OpenPlay reads your server's directory listings, matches each release name against
          TMDB for posters and details, and plays the file straight from the server. Video
          never passes through this app's backend — only the listing does.
        </p>
        <p className="text-[13px] mt-3" style={{ color: 'var(--text-faint)' }}>
          Metadata from{' '}
          <a
            href="https://www.themoviedb.org"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:underline"
            style={{ color: 'var(--accent)' }}
          >
            TMDB <ExternalLink size={11} />
          </a>
          . This product uses the TMDB API but is not endorsed or certified by TMDB.
        </p>
      </section>
    </div>
  );
}

/* ── VLC handoff ─────────────────────────────────────────────────────────── */

function VlcSection() {
  const [vlcPath, setVlcPath] = useState('C:\\Program Files\\VideoLAN\\VLC\\vlc.exe');
  const [downloaded, setDownloaded] = useState(false);

  const grab = () => {
    downloadVlcRegistryFile(vlcPath.trim());
    setDownloaded(true);
  };

  return (
    <Section
      title="Play in VLC"
      hint="Some files cannot play in a browser — VLC handles every codec, and lets you switch audio track and turn on the subtitles baked into the file."
    >
      <Notice tone="info" title="One-time setup">
        A web page cannot launch a program directly. Registering a URL scheme once lets the
        <span className="mono"> Play in VLC </span> button hand the stream straight over.
      </Notice>

      <ol className="mt-4 space-y-3 text-[15px]" style={{ color: 'var(--text-soft)' }}>
        <li className="flex gap-3">
          <Step n={1} />
          <div className="flex-1">
            <p>Confirm where VLC is installed.</p>
            <input
              type="text"
              value={vlcPath}
              onChange={e => setVlcPath(e.target.value)}
              spellCheck={false}
              aria-label="Path to vlc.exe"
              className="control w-full px-3 h-10 mono text-[13px] outline-none mt-2"
            />
          </div>
        </li>

        <li className="flex gap-3">
          <Step n={2} />
          <div className="flex-1">
            <p>Download the registration file and run it. Windows will ask you to confirm.</p>
            <button
              onClick={grab}
              className="control flex items-center gap-2 px-3.5 h-10 text-[14px] mt-2"
            >
              {downloaded ? <Check size={15} style={{ color: 'var(--ok)' }} /> : <Download size={15} />}
              {downloaded ? 'Downloaded' : 'Download openplay-vlc-setup.reg'}
            </button>
          </div>
        </li>

        <li className="flex gap-3">
          <Step n={3} />
          <div className="flex-1">
            <p className="flex items-center gap-2">
              <MonitorPlay size={15} style={{ color: 'var(--accent)' }} aria-hidden="true" />
              Done — <span className="mono">Play in VLC</span> now opens VLC directly.
            </p>
            <p className="text-[13px] mt-1.5" style={{ color: 'var(--text-faint)' }}>
              It registers <span className="mono">openplay://</span> for your user account only, no
              administrator rights needed. Undo with{' '}
              <span className="mono">reg delete HKCU\Software\Classes\openplay /f</span>.
              {isVlcReady() && ' Already working on this machine.'}
            </p>
          </div>
        </li>
      </ol>

      <p className="text-[13px] mt-4" style={{ color: 'var(--text-faint)' }}>
        Skipping setup is fine — the button falls back to downloading a{' '}
        <span className="mono">.m3u</span> playlist you can open in any player.
      </p>
    </Section>
  );
}

function Step({ n }) {
  return (
    <span
      className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mono text-[12px] font-semibold"
      style={{ background: 'var(--ink-800)', border: '1px solid var(--line)', color: 'var(--accent)' }}
    >
      {n}
    </span>
  );
}

/* ── Shared bits ─────────────────────────────────────────────────────────── */

function Section({ title, hint, children }) {
  return (
    <section className="mb-10">
      <h2 className="text-[16px] font-semibold mb-1">{title}</h2>
      {hint && <p className="text-[14px] mb-3" style={{ color: 'var(--text-dim)' }}>{hint}</p>}
      {children}
    </section>
  );
}

function Choice({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="px-3.5 h-10 rounded-lg text-[15px] transition-colors"
      style={{
        background: active ? 'var(--accent)' : 'var(--ink-800)',
        color: active ? 'var(--accent-ink)' : 'var(--text-soft)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
        fontWeight: active ? 600 : 400,
      }}
    >
      {children}
    </button>
  );
}

function withTrailingSlash(url) {
  return url.endsWith('/') ? url : url + '/';
}
