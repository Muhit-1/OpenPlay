// src/pages/Settings.jsx
//
// Everything about how OpenPlay connects, plays and looks, in one list of
// sections. Appearance, playback and subtitle choices apply the moment you make
// them. Server changes (the address, which libraries are on) wait for "Save
// changes", because a half-edited address would otherwise break the app.

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Check, X, Trash2, Loader2, ExternalLink, Radar, Download, Globe, Search, KeyRound,
  HardDrive, Layers, CirclePlay, Captions, Palette, Wrench, Database,
  Clapperboard, Tv, Sparkles, MonitorPlay, RefreshCw,
} from 'lucide-react';
import { clearMetaCache } from '../lib/tmdb';
import { ACCENTS, CARD_SIZES, TMDB_LANGS, applyTheme } from '../lib/theme';
import { discoverLibraries } from '../lib/discover';
import { getLibraries, saveLibraries } from '../lib/server';
import { downloadVlcRegistryFile, isVlcReady } from '../lib/vlc';
import { Notice } from '../components/ui';
import FilterMenu, { MenuItem } from '../components/FilterMenu';
import {
  SetCard, SetRow, StatusPill, Toggle, Segmented, Swatches, TagInput, Field, SaveBar,
} from '../components/SettingsUI';
import { SettingsQuery } from '../components/settingsQuery';
import { getItem, removeItem, setItem } from '../lib/storage.js';
import { normalizeServerAddress } from '../lib/url';
import { apiBase, setApiBase, usesHelper, pingApi, DEFAULT_HELPER } from '../lib/api';
import {
  SUB_LANGUAGES, SUB_SIZES, languageLabel, subtitlesConfigured, getSubLang, setSubLang,
  readSubStyle, saveSubStyle,
} from '../lib/subtitles';
import { clearHistory, getContinueWatching, getBookmarks } from '../lib/firebase';
import { clearIndex, forgetStarted } from '../lib/catalog';
import { useAsync } from '../lib/useAsync';

const CATEGORY_ICON = { movies: Clapperboard, series: Tv, animation: Sparkles };

const SECTIONS = [
  { id: 'sec-server',     label: 'Server',         icon: HardDrive },
  { id: 'sec-libraries',  label: 'Libraries',      icon: Layers },
  { id: 'sec-playback',   label: 'Playback',       icon: CirclePlay },
  { id: 'sec-subtitles',  label: 'Subtitles',      icon: Captions },
  { id: 'sec-appearance', label: 'Appearance',     icon: Palette },
  { id: 'sec-advanced',   label: 'VLC and helper', icon: Wrench },
  { id: 'sec-data',       label: 'Data',           icon: Database },
];

// What each section answers to in "Search settings". A card shows when its title
// or any of this text matches; rows then narrow further by their own words.
const SEARCH_TEXT = {
  'sec-server': 'server portal address ip http connect test find libraries extra servers additional machines forget remove reset disconnect',
  'sec-libraries': 'libraries movies series animation switch hide show online offline quality remove find again',
  'sec-playback': 'playback autoplay next episode automatically binge list panel sidebar theater episodes',
  'sec-subtitles': 'subtitles opensubtitles api key account login language caption size text background dark',
  'sec-appearance': 'appearance accent colour color theme poster size cards grid title language metadata tmdb',
  'sec-advanced': 'vlc helper registry reg openplay setup codec audio track subtitles inside address localhost 8080 api',
  'sec-data': 'data export history watchlist backup download json clear delete remove reset filter index rebuild genre rating year language catalogue',
};

function readExtra() {
  try {
    const list = JSON.parse(getItem('extra_urls') || '[]');
    return Array.isArray(list) ? list.filter(u => typeof u === 'string') : [];
  } catch { return []; }
}

const snapshot = () => ({
  portal: getItem('portal_url') || getItem('isp_url') || '',
  libraries: JSON.stringify(getLibraries()),
  extra: JSON.stringify(readExtra()),
});

export default function Settings() {
  const [portal, setPortal] = useState(() => snapshot().portal);
  const [libraries, setLibraries] = useState(() => getLibraries());
  const [extra, setExtra] = useState(readExtra);
  const [saved, setSaved] = useState(snapshot);
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState(null);
  const [extraError, setExtraError] = useState('');
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState(SECTIONS[0].id);

  // Appearance and other choices that apply immediately.
  const [accent, setAccent] = useState(() => getItem('accent_color') || ACCENTS[0].value);
  const [cardSize, setCardSize] = useState(() => getItem('card_size') || 'Medium');
  const [lang, setLang] = useState(() => getItem('tmdb_lang') || 'en-US');
  const [autoplay, setAutoplay] = useState(() => getItem('autoplay_next') !== 'off');
  const [episodePanel, setEpisodePanel] = useState(() => getItem('episode_panel') !== 'hidden');
  const [subLang, setSubLangState] = useState(getSubLang);
  const [subStyle, setSubStyle] = useState(readSubStyle);

  const { data: subsReady } = useAsync('subs-configured', subtitlesConfigured, null);

  useEffect(() => {
    setItem('accent_color', accent);
    setItem('card_size', cardSize);
    applyTheme();
  }, [accent, cardSize]);

  useEffect(() => {
    const previous = getItem('tmdb_lang');
    setItem('tmdb_lang', lang);
    if (previous && previous !== lang) clearMetaCache();
  }, [lang]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  // Highlight the section being read in the list on the left.
  useEffect(() => {
    // Several sections can be on screen at once; the first one in page order wins.
    const visible = new Set();
    const observer = new IntersectionObserver(
      entries => {
        for (const e of entries) { if (e.isIntersecting) visible.add(e.target.id); else visible.delete(e.target.id); }
        const first = SECTIONS.find(s => visible.has(s.id));
        if (first) setCurrent(first.id);
      },
      { rootMargin: '-96px 0px -55% 0px' }
    );
    for (const s of SECTIONS) { const el = document.getElementById(s.id); if (el) observer.observe(el); }
    return () => observer.disconnect();
  }, [query]);

  const addressCheck = normalizeServerAddress(portal);

  const discover = useCallback(async () => {
    setScanning(true);
    setScan(null);

    const address = normalizeServerAddress(portal);
    if (!address.ok) {
      setScan({ ok: false, text: address.error });
      setScanning(false);
      return;
    }
    setPortal(address.url);          // show what was actually understood

    const started = performance.now();
    const result = await discoverLibraries(address.url);
    const ms = Math.round(performance.now() - started);

    if (result.error) {
      setScan({ ok: false, text: result.error });
    } else {
      // Keep the libraries you had switched off switched off.
      const off = new Set(libraries.filter(l => l.enabled === false).map(l => l.url));
      setLibraries(result.libraries.map(l => (off.has(l.url) ? { ...l, enabled: false } : l)));
      setScan({
        ok: true,
        text: `Reachable \u00b7 found ${result.libraries.length} libraries across ${
          new Set(result.libraries.map(l => l.host)).size
        } servers in ${ms} ms`,
        warning: result.warning,
      });
    }
    setScanning(false);
  }, [portal, libraries]);

  // How many server settings differ from what is saved.
  const dirty = useMemo(() => {
    let n = 0;
    if (portal.trim() !== saved.portal.trim()) n += 1;
    if (JSON.stringify(libraries) !== saved.libraries) n += 1;
    if (JSON.stringify(extra) !== saved.extra) n += 1;
    return n;
  }, [portal, libraries, extra, saved]);

  const save = () => {
    const address = normalizeServerAddress(portal);
    if (portal.trim() && !address.ok) { setScan({ ok: false, text: address.error }); return; }

    if (portal.trim()) {
      setItem('portal_url', address.url);
      setItem('isp_url', address.url);
      setPortal(address.url);
    }
    saveLibraries(libraries);
    setItem('extra_urls', JSON.stringify(extra));
    clearMetaCache();
    setSaved(snapshot());
    setToast('Settings saved');
  };

  const discard = () => {
    setPortal(saved.portal);
    setLibraries(JSON.parse(saved.libraries));
    setExtra(JSON.parse(saved.extra));
    setScan(null);
    setExtraError('');
  };

  const forgetServer = () => {
    ['portal_url', 'isp_url', 'extra_urls', 'libraries'].forEach(k => removeItem(k));
    clearMetaCache();
    setPortal('');
    setLibraries([]);
    setExtra([]);
    setScan(null);
    setSaved({ portal: '', libraries: '[]', extra: '[]' });
    setToast('Server forgotten');
  };

  const changeExtra = values => {
    const next = [];
    let bad = '';
    for (const value of values) {
      const address = normalizeServerAddress(value);
      if (address.ok) { if (!next.includes(address.url)) next.push(address.url); } else bad = address.error;
    }
    setExtraError(bad);
    setExtra(next);
  };

  const setLibraryEnabled = (url, enabled) =>
    setLibraries(prev => prev.map(l => (l.url === url ? { ...l, enabled } : l)));

  const grouped = ['movies', 'series', 'animation'].map(category => ({
    category,
    items: libraries.filter(l => (l.category || 'movies') === category),
  })).filter(g => g.items.length);

  const jump = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const q = query.trim().toLowerCase();
  const sizeIndex = Math.max(0, CARD_SIZES.findIndex(s => s.label === cardSize));

  const serverTone = !portal.trim() || libraries.length === 0 ? 'warn' : 'ok';

  return (
    <SettingsQuery.Provider value={q}>
      <div className="page-enter px-5 sm:px-8 py-9 max-w-[1500px]">
        <header className="flex flex-wrap items-end justify-between gap-5 mb-7">
          <div>
            <h1 className="font-display text-[34px] leading-[1.1]">Settings</h1>
            <p className="mt-1.5" style={{ color: 'var(--text-dim)' }}>
              Everything about how OpenPlay connects, plays and looks.
            </p>
          </div>
          <label className="well" style={{ width: 'min(340px, 100%)' }}>
            <Search size={17} className="well-icon" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search settings"
              aria-label="Search settings"
            />
          </label>
        </header>

        <div className="grid gap-12 items-start lg:[grid-template-columns:220px_minmax(0,1fr)]">
          <nav className="set-nav hidden lg:flex" aria-label="Settings sections">
            {SECTIONS.map(s => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => jump(s.id)}
                  aria-current={current === s.id}
                >
                  <Icon size={17} aria-hidden="true" />
                  {s.label}
                  {s.id === 'sec-subtitles' && subsReady === false && (
                    <span
                      className="ml-auto w-2 h-2 rounded-full"
                      style={{ background: 'var(--warn)', boxShadow: '0 0 6px var(--warn)' }}
                      title="Needs an API key"
                    />
                  )}
                </button>
              );
            })}
          </nav>

          <div className="min-w-0 max-w-[880px]">
            {/* ── Server ── */}
            <SetCard
              id="sec-server"
              title="Server"
              description="The address of your ISP's media portal. OpenPlay follows it to find every library."
              status={<StatusPill tone={serverTone}>{serverTone === 'ok' ? 'Connected' : 'Not set up'}</StatusPill>}
              keywords={SEARCH_TEXT['sec-server']}
            >
              <SetRow
                stack
                title="Portal address"
                description="Paste the page your ISP lists its servers on. An IP address works."
                keywords="ip http connect test"
              >
                <div className="flex gap-2.5 items-start">
                  <Field
                    icon={Globe}
                    tone={scan ? (scan.ok ? 'ok' : 'bad') : portal.trim() && !addressCheck.ok ? 'bad' : undefined}
                    hintTone={scan ? (scan.ok ? 'ok' : 'bad') : portal.trim() && !addressCheck.ok ? 'bad' : undefined}
                    hint={
                      scan ? (
                        <>{scan.ok ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}{scan.text}</>
                      ) : portal.trim() ? (
                        addressCheck.ok
                          ? <>Will connect to <span className="mono">{addressCheck.url}</span></>
                          : addressCheck.error
                      ) : 'Something like 172.16.50.12'
                    }
                    inputProps={{
                      type: 'text',
                      inputMode: 'url',
                      autoComplete: 'off',
                      spellCheck: false,
                      value: portal,
                      onChange: e => { setPortal(e.target.value); setScan(null); },
                      onKeyDown: e => e.key === 'Enter' && addressCheck.ok && discover(),
                      placeholder: '172.16.50.12  or  http://172.16.50.12/',
                      'aria-label': 'ISP portal address',
                      'aria-invalid': portal.trim() !== '' && !addressCheck.ok,
                      className: 'mono',
                    }}
                  />
                  <button
                    onClick={discover}
                    disabled={!addressCheck.ok || scanning}
                    className="control flex items-center gap-2 px-4 h-[44px] text-[14.5px] font-semibold disabled:opacity-40 flex-shrink-0"
                  >
                    {scanning ? <Loader2 size={15} className="animate-spin" /> : <Radar size={15} />}
                    {scanning ? 'Scanning' : 'Find libraries'}
                  </button>
                </div>

                {window.location.protocol === 'https:' && !usesHelper() && /^http:\/\//i.test(portal.trim()) && (
                  <div className="mt-3">
                    <Notice tone="warn" title="This page is HTTPS, your server is HTTP">
                      Browsers refuse to play http:// video on an https:// page, and a cloud-hosted
                      OpenPlay cannot reach private addresses like 172.16.x.x. Run OpenPlay on your own
                      network (<span className="mono">npm start</span> or Docker) and open it over http://.
                    </Notice>
                  </div>
                )}

                {scan?.warning && (
                  <div className="mt-3">
                    <Notice tone="warn" title="Some servers did not answer">
                      {scan.warning} They are kept in the list and marked offline — a server that is
                      down now may be back later.
                    </Notice>
                  </div>
                )}
              </SetRow>

              <SetRow
                stack
                title="Extra servers"
                description="Other machines to show on Home as well. Press Enter to add one."
                keywords="additional addresses more servers"
              >
                <TagInput
                  values={extra}
                  onChange={changeExtra}
                  placeholder="172.16.50.7"
                  label="Add a server address"
                />
                <p className={`field-hint ${extraError ? 'is-bad' : ''}`} role={extraError ? 'alert' : undefined}>
                  {extraError}
                </p>
              </SetRow>

              <SetRow
                title="Forget this server"
                description="Removes the address, the libraries found and the extra servers. Your history stays."
                keywords="clear remove reset disconnect"
              >
                <button
                  onClick={forgetServer}
                  disabled={!portal && libraries.length === 0}
                  className="control flex items-center gap-2 px-4 h-10 text-[14px] font-semibold disabled:opacity-40"
                  style={{ color: 'var(--error)' }}
                >
                  <Trash2 size={15} aria-hidden="true" />
                  Forget server
                </button>
              </SetRow>
            </SetCard>

            {/* ── Libraries ── */}
            <SetCard
              id="sec-libraries"
              title="Libraries"
              description="Found automatically from your portal. Switch off the ones you never watch."
              keywords={SEARCH_TEXT['sec-libraries']}
              action={
                <button
                  onClick={discover}
                  disabled={!addressCheck.ok || scanning}
                  className="control flex items-center gap-2 px-3 h-8 text-[13px] font-semibold disabled:opacity-40"
                >
                  {scanning ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Find libraries again
                </button>
              }
            >
              {grouped.length === 0 ? (
                <div className="px-6 py-8 text-center" style={{ borderTop: '1px solid var(--line)', color: 'var(--text-dim)' }}>
                  <p className="font-display text-[17px]" style={{ color: 'var(--text)' }}>No libraries yet</p>
                  <p className="text-[14px] mt-1">Enter your portal address above and choose Find libraries.</p>
                </div>
              ) : grouped.map(group => {
                const Icon = CATEGORY_ICON[group.category];
                return (
                  <div key={group.category}>
                    <p
                      className="flex items-center gap-2 px-6 pt-4 pb-2 text-[12.5px] font-semibold capitalize"
                      style={{ borderTop: '1px solid var(--line)', color: 'var(--text-dim)' }}
                    >
                      <Icon size={14} aria-hidden="true" />
                      {group.category}
                      <span className="mono font-normal" style={{ color: 'var(--text-faint)' }}>{group.items.length}</span>
                    </p>
                    {group.items.map(lib => (
                      <div
                        key={lib.url}
                        className="grid items-center gap-3.5 px-6 py-3"
                        style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto auto' }}
                      >
                        <span
                          className="chip-dot"
                          style={{
                            color: lib.online === false ? 'var(--text-faint)' : 'var(--ok)',
                            boxShadow: lib.online === false ? 'none' : '0 0 8px var(--ok)',
                          }}
                          aria-hidden="true"
                        />
                        <div className="min-w-0" style={{ opacity: lib.enabled === false ? 0.5 : 1 }}>
                          <p className="text-[14.5px] font-semibold truncate">{lib.label}</p>
                          <p className="mono text-[12.5px] truncate" style={{ color: 'var(--text-dim)' }}>
                            {[lib.quality && `${lib.quality}p`, lib.host].filter(Boolean).join(' \u00b7 ')}
                            {lib.online === false && (
                              <span style={{ color: 'var(--warn)' }}> {'\u00b7'} not answering</span>
                            )}
                          </p>
                        </div>
                        <button
                          onClick={() => setLibraries(prev => prev.filter(l => l.url !== lib.url))}
                          aria-label={`Remove ${lib.label}`}
                          title="Remove"
                          className="p-1.5 rounded-md"
                          style={{ color: 'var(--text-faint)' }}
                        >
                          <X size={15} />
                        </button>
                        <Toggle
                          checked={lib.enabled !== false}
                          onChange={on => setLibraryEnabled(lib.url, on)}
                          label={`Show ${lib.label}`}
                        />
                      </div>
                    ))}
                  </div>
                );
              })}
            </SetCard>

            {/* ── Playback ── */}
            <SetCard
              id="sec-playback"
              title="Playback"
              description="How the player behaves when you press play."
              keywords={SEARCH_TEXT['sec-playback']}
            >
              <SetRow
                title="Play the next episode automatically"
                description="When an episode ends, the next one starts. You get a card to cancel it."
                keywords="autoplay binge"
              >
                <Toggle
                  checked={autoplay}
                  onChange={on => { setAutoplay(on); setItem('autoplay_next', on ? 'on' : 'off'); }}
                  label="Play the next episode automatically"
                />
              </SetRow>
              <SetRow
                title="Show the episode list beside the video"
                description="Every season of the show, with what you have watched. You can also hide it from the player."
                keywords="episodes panel sidebar theater"
              >
                <Toggle
                  checked={episodePanel}
                  onChange={on => { setEpisodePanel(on); setItem('episode_panel', on ? 'shown' : 'hidden'); }}
                  label="Show the episode list beside the video"
                />
              </SetRow>
            </SetCard>

            {/* ── Subtitles ── */}
            <SetCard
              id="sec-subtitles"
              title="Subtitles"
              description="Subtitles come from OpenSubtitles and play right in the browser."
              keywords={SEARCH_TEXT['sec-subtitles']}
              status={
                subsReady == null ? null
                  : <StatusPill tone={subsReady ? 'ok' : 'warn'}>{subsReady ? 'Ready' : 'Needs a key'}</StatusPill>
              }
            >
              <SetRow
                stack
                title="OpenSubtitles"
                description={subsReady
                  ? 'Connected. Press the CC button in the player to search for subtitles.'
                  : 'Add your API key and account login to .env, then restart OpenPlay. They stay on your server and are never sent to the browser.'}
                keywords="api key account login"
              >
                {!subsReady && (
                  <div className="well" style={{ height: 'auto', padding: '12px 14px', alignItems: 'flex-start' }}>
                    <KeyRound size={17} className="well-icon" style={{ marginTop: 2 }} aria-hidden="true" />
                    <pre className="mono text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--text-soft)' }}>
{`OPENSUBTITLES_API_KEY=your-key
OPENSUBTITLES_USERNAME=your-login
OPENSUBTITLES_PASSWORD=your-password`}
                    </pre>
                  </div>
                )}
                <a
                  href="https://www.opensubtitles.com/consumers"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 mt-3 text-[13.5px] hover:underline"
                  style={{ color: 'var(--accent)' }}
                >
                  Get a free API key <ExternalLink size={12} aria-hidden="true" />
                </a>
              </SetRow>

              <SetRow title="Preferred language" description="The language searched first in the player." keywords="language">
                <FilterMenu label="" value={languageLabel(subLang)} searchable="Find a language" right>
                  {({ close, query: text }) => SUB_LANGUAGES
                    .filter(l => !text || l.label.toLowerCase().includes(text.toLowerCase()))
                    .map(l => (
                      <MenuItem
                        key={l.code}
                        selected={l.code === subLang}
                        onClick={() => { setSubLangState(l.code); setSubLang(l.code); close(); }}
                      >
                        {l.label}
                      </MenuItem>
                    ))}
                </FilterMenu>
              </SetRow>

              <SetRow title="Caption size" description="Scales with the picture, including fullscreen." keywords="text size">
                <Segmented
                  label="Caption size"
                  value={subStyle.size}
                  onChange={size => setSubStyle(saveSubStyle({ ...subStyle, size }))}
                  options={SUB_SIZES.map(s => ({ value: s.key, label: s.label }))}
                />
              </SetRow>

              <SetRow title="Dark background behind text" description="Keeps captions readable over bright scenes." keywords="caption background">
                <Toggle
                  checked={subStyle.background}
                  onChange={background => setSubStyle(saveSubStyle({ ...subStyle, background }))}
                  label="Dark background behind text"
                />
              </SetRow>
            </SetCard>

            {/* ── Appearance ── */}
            <SetCard
              id="sec-appearance"
              title="Appearance"
              description="Changes apply as soon as you pick them."
              keywords={SEARCH_TEXT['sec-appearance']}
            >
              <SetRow title="Accent colour" description="Used for the current page, buttons and progress." keywords="color theme">
                <Swatches
                  label="Accent colour"
                  value={accent}
                  onChange={setAccent}
                  options={ACCENTS.map(a => ({ value: a.value, label: a.label }))}
                />
              </SetRow>

              <SetRow title="Poster size" description={`${cardSize} \u00b7 ${CARD_SIZES[sizeIndex].w.replace('px', '')} px wide`} keywords="cards grid">
                <input
                  type="range"
                  className="range"
                  min={0}
                  max={CARD_SIZES.length - 1}
                  step={1}
                  value={sizeIndex}
                  onChange={e => setCardSize(CARD_SIZES[Number(e.target.value)].label)}
                  aria-label="Poster size"
                  aria-valuetext={cardSize}
                />
              </SetRow>

              <SetRow title="Title language" description="Titles, summaries and cast come from TMDB in this language." keywords="metadata tmdb">
                <FilterMenu label="" value={TMDB_LANGS.find(l => l.value === lang)?.label || lang} searchable="Find a language" right>
                  {({ close, query: text }) => TMDB_LANGS
                    .filter(l => !text || l.label.toLowerCase().includes(text.toLowerCase()))
                    .map(l => (
                      <MenuItem key={l.value} selected={l.value === lang} onClick={() => { setLang(l.value); close(); }}>
                        {l.label}
                      </MenuItem>
                    ))}
                </FilterMenu>
              </SetRow>
            </SetCard>

            {/* ── VLC and helper ── */}
            <SetCard
              id="sec-advanced"
              title="VLC and helper"
              description="For files a browser cannot play, and for using OpenPlay from a hosted page."
              keywords={SEARCH_TEXT['sec-advanced']}
            >
              <VlcRow />
              <HelperRow />
            </SetCard>

            {/* ── Data ── */}
            <DataCard setToast={setToast} />

            {q && SECTIONS.every(s => !SEARCH_TEXT[s.id].includes(q)) && (
              <div className="text-center py-20" style={{ color: 'var(--text-dim)' }}>
                <p className="font-display text-[20px]" style={{ color: 'var(--text)' }}>No settings match</p>
                <p className="mt-1">Try a different word, like &ldquo;subtitles&rdquo; or &ldquo;accent&rdquo;.</p>
              </div>
            )}

            <section className="set-card p-6 mt-2">
              <h2 className="font-display text-[17px] mb-2">How this works</h2>
              <p className="text-[14.5px] leading-relaxed" style={{ color: 'var(--text-soft)' }}>
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
                . This product uses the TMDB API but is not endorsed or certified by TMDB. Subtitles
                from{' '}
                <a href="https://www.opensubtitles.com" target="_blank" rel="noreferrer" className="hover:underline" style={{ color: 'var(--accent)' }}>
                  OpenSubtitles
                </a>.
              </p>
            </section>
          </div>
        </div>

        <SaveBar count={dirty} onSave={save} onDiscard={discard} />
        {toast && !dirty && (
          <div className="save-bar" role="status">
            <Check size={16} style={{ color: 'var(--ok)' }} aria-hidden="true" />
            <span className="text-[14.5px] font-medium pr-2">{toast}</span>
          </div>
        )}
      </div>
    </SettingsQuery.Provider>
  );
}

/* ── VLC handoff ─────────────────────────────────────────────────────────── */

function VlcRow() {
  const [vlcPath, setVlcPath] = useState('C:\\Program Files\\VideoLAN\\VLC\\vlc.exe');
  const [downloaded, setDownloaded] = useState(false);

  const grab = () => {
    downloadVlcRegistryFile(vlcPath.trim());
    setDownloaded(true);
  };

  return (
    <SetRow
      stack
      title="Play in VLC"
      description="VLC handles every codec, switches audio tracks, and shows subtitles stored inside the file. A web page cannot launch a program on its own, so a one-time setup registers the handoff."
      keywords="vlc registry reg openplay setup"
    >
      <ol className="space-y-4 text-[14.5px]" style={{ color: 'var(--text-soft)' }}>
        <li className="flex gap-3">
          <Step n={1} />
          <div className="flex-1 min-w-0">
            <p>Confirm where VLC is installed.</p>
            <label className="well is-sm mt-2">
              <input
                type="text"
                value={vlcPath}
                onChange={e => setVlcPath(e.target.value)}
                spellCheck={false}
                aria-label="Path to vlc.exe"
                className="mono"
                style={{ fontSize: 13 }}
              />
            </label>
          </div>
        </li>

        <li className="flex gap-3">
          <Step n={2} />
          <div className="flex-1">
            <p>Download the registration file and run it. Windows will ask you to confirm.</p>
            <button onClick={grab} className="control flex items-center gap-2 px-3.5 h-10 text-[14px] mt-2">
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
              {isVlcReady() && ' Already working on this machine.'} Skipping setup is fine: the button
              falls back to downloading a <span className="mono">.m3u</span> playlist.
            </p>
          </div>
        </li>
      </ol>
    </SetRow>
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

/** The address of the local helper, for when OpenPlay is used from a hosted page. */
function HelperRow() {
  const [value, setValue] = useState(() => apiBase());
  const [result, setResult] = useState(null);
  const [testing, setTesting] = useState(false);

  const test = async () => {
    setTesting(true);
    setResult(null);
    const address = value.trim() ? normalizeServerAddress(value) : { ok: true, url: apiBase() };
    if (!address.ok) { setTesting(false); setResult({ ok: false, text: address.error }); return; }
    const { reachable, health } = await pingApi(address.url);
    setTesting(false);
    setResult(
      !reachable ? { ok: false, text: 'No helper answered at that address.' }
        : health.ok ? { ok: true, text: 'Helper is running and TMDB works.' }
        : { ok: false, text: `Helper is running, but TMDB: ${health.reason}.` }
    );
  };

  const save = () => {
    if (value.trim()) {
      const address = normalizeServerAddress(value);
      if (!address.ok) { setResult({ ok: false, text: address.error }); return; }
      setApiBase(address.url);
      setValue(address.url.replace(/\/$/, ''));
    } else {
      setApiBase('');
    }
    clearMetaCache();
    setResult({ ok: true, text: 'Saved.' });
  };

  return (
    <SetRow
      stack
      title="Helper address"
      description={usesHelper()
        ? 'Where the OpenPlay helper is running. Start it with npm run helper.'
        : 'Only needed when you open OpenPlay from a hosted page. Leave empty when you run it yourself with npm start.'}
      keywords="helper api base localhost 8080"
    >
      <div className="flex gap-2.5 items-start flex-wrap">
        <Field
          icon={Globe}
          tone={result ? (result.ok ? 'ok' : 'bad') : undefined}
          hintTone={result ? (result.ok ? 'ok' : 'bad') : undefined}
          hint={result ? result.text : ''}
          inputProps={{
            type: 'text',
            inputMode: 'url',
            value,
            onChange: e => { setValue(e.target.value); setResult(null); },
            placeholder: DEFAULT_HELPER,
            spellCheck: false,
            'aria-label': 'Helper address',
            className: 'mono',
          }}
        />
        <button onClick={test} disabled={testing} className="control px-4 h-[44px] text-[14.5px] font-semibold disabled:opacity-40">
          {testing ? 'Testing' : 'Test'}
        </button>
        <button onClick={save} className="btn-accent px-4 h-[44px] rounded-[10px] text-[14.5px]">Save</button>
      </div>
    </SetRow>
  );
}

/* ── Data ────────────────────────────────────────────────────────────────── */

function DataCard({ setToast }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(timer);
  }, [confirming]);

  const exportData = async () => {
    setBusy(true);
    try {
      const [history, watchlist] = await Promise.all([
        getContinueWatching(1000).catch(() => []),
        getBookmarks().catch(() => []),
      ]);
      const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), history, watchlist }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'openplay-data.json';
      a.click();
      URL.revokeObjectURL(url);
      setToast('Exported openplay-data.json');
    } finally { setBusy(false); }
  };

  const rebuildIndex = async () => {
    setBusy(true);
    try {
      await clearIndex();
      forgetStarted();
      setToast('Filter index cleared \u2014 it rebuilds when you next open a library');
    } catch {
      setToast('Could not clear the filter index');
    } finally { setBusy(false); }
  };

  const clear = async () => {
    if (!confirming) { setConfirming(true); return; }
    setBusy(true);
    try {
      await clearHistory();
      setToast('Watch history cleared');
    } catch {
      setToast('Could not clear history');
    } finally { setBusy(false); setConfirming(false); }
  };

  return (
    <SetCard
      id="sec-data"
      title="Data"
      description="History and the watchlist live in this browser, or in your Firebase project if you set one up."
      keywords={SEARCH_TEXT['sec-data']}
    >
      <SetRow title="Export" description="Download your history and watchlist as a file." keywords="backup download json">
        <button onClick={exportData} disabled={busy} className="control flex items-center gap-2 px-4 h-10 text-[14px] font-semibold disabled:opacity-50">
          <Download size={15} aria-hidden="true" />
          Export data
        </button>
      </SetRow>
      <SetRow title="Rebuild filter index" description="Genre, rating, year and language filters use an index of your library, kept in this browser. It updates itself; rebuild it if filters look wrong." keywords="genre rating year language catalogue index filters">
        <button onClick={rebuildIndex} disabled={busy} className="control flex items-center gap-2 px-4 h-10 text-[14px] font-semibold disabled:opacity-50">
          Rebuild
        </button>
      </SetRow>
      <SetRow title="Clear watch history" description="Removes everything you have played from History and Continue watching. Your watchlist is kept. This can't be undone." keywords="delete remove reset">
        <button
          onClick={clear}
          disabled={busy}
          className="control flex items-center gap-2 px-4 h-10 text-[14px] font-semibold disabled:opacity-50"
          style={{ color: 'var(--error)' }}
        >
          <Trash2 size={15} aria-hidden="true" />
          {confirming ? 'Click again to confirm' : 'Clear history'}
        </button>
      </SetRow>
    </SetCard>
  );
}

