// src/components/EpisodeList.jsx
// The other videos in the same folder, grouped into seasons when they name one.
//
// Two shapes:
//   variant="tabs"   season tabs over a list — used on a title's detail page
//   variant="panel"  a side panel for the player, so the next episode is one
//                    click away without leaving the video

import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Check, PanelRightClose } from 'lucide-react';
import { fetchSeasonEpisodes } from '../lib/tmdb';
import { parseRelease } from '../lib/release';
import { orderEpisodes, sameUrl } from '../lib/episodes';
import { dragLinkProps } from '../lib/drag';
import { episodeName } from '../lib/history';
import { normalizeFileUrl } from '../lib/text';
import { useAsync } from '../lib/useAsync';
import FilterMenu, { MenuItem, Switch } from './FilterMenu';
import { FadeImg } from './ui';

export default function EpisodeList({
  files = [], currentUrl, showMeta = null,
  variant = 'tabs', showTitle = '', progress = null,
  autoplay = true, onAutoplayChange, onHide,
}) {
  const navigate = useNavigate();

  const seasons = useMemo(() => groupBySeason(files), [files]);
  const seasonNumbers = useMemo(
    () => Object.keys(seasons).map(Number).sort((a, b) => a - b),
    [seasons]
  );

  // Open on the season that is playing now.
  const currentSeason = seasonNumbers.find(n => seasons[n].some(f => sameUrl(f.url, currentUrl)));

  const [selected, setSelected] = useState(null);
  const [seenSeason, setSeenSeason] = useState(currentSeason);
  if (seenSeason !== currentSeason) {          // moved to another season: follow it
    setSeenSeason(currentSeason);
    setSelected(null);
  }

  // Derived rather than stored, so a change of file list cannot leave the tab
  // pointing at a season that no longer exists.
  const active = seasonNumbers.includes(selected)
    ? selected
    : (currentSeason ?? seasonNumbers[0] ?? 0);

  const { data: tmdbEpisodes } = useAsync(
    showMeta?.id && active !== 0 ? `${showMeta.id}|${active}` : null,
    async () => {
      const list = await fetchSeasonEpisodes(showMeta.id, active);
      return Array.isArray(list)
        ? Object.fromEntries(list.map(ep => [ep.episode_number, ep]))
        : {};
    },
    {}
  );

  // Keep the playing episode in view as the player moves along the season.
  const listRef = useRef(null);
  useEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector('[data-current="true"]');
    if (!list || !row) return;
    list.scrollTop = row.offsetTop - list.clientHeight / 2 + row.clientHeight / 2;
  }, [currentUrl, active, variant]);

  if (files.length === 0) return null;

  const rows = seasons[active] || [];
  const panel = variant === 'panel';

  const open = file =>
    navigate(`/watch/${encodeURIComponent(file.url)}`, { state: { file, meta: showMeta } });

  const onRowKey = (e, file) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(file); }
  };

  const seasonLabel = n => (n === 0 ? 'Files' : `Season ${n}`);
  const position = rows.findIndex(f => sameUrl(f.url, currentUrl)) + 1;

  return (
    <div
      className="panel overflow-hidden flex flex-col"
      style={panel ? { maxHeight: 'calc(100vh - 6.5rem)' } : undefined}
    >
      {panel && (
        <>
          <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-3">
            <div className="min-w-0">
              <p className="font-display text-base leading-tight truncate">{showTitle || 'Episodes'}</p>
              <p className="data mt-1">
                {seasonLabel(active)}{position > 0 ? ` · ${position} of ${rows.length}` : ` · ${rows.length} episodes`}
              </p>
            </div>
            {onHide && (
              <button
                onClick={onHide}
                aria-label="Hide episode list"
                title="Hide episode list"
                className="p-1.5 rounded-lg flex-shrink-0 transition-colors"
                style={{ color: 'var(--text-dim)' }}
              >
                <PanelRightClose size={16} aria-hidden="true" />
              </button>
            )}
          </div>

          {seasonNumbers.length > 1 && (
            <div className="px-3 pb-3">
              <FilterMenu block value={seasonLabel(active)}>
                {({ close }) => seasonNumbers.map(n => (
                  <MenuItem
                    key={n}
                    selected={n === active}
                    hint={`${seasons[n].length} eps`}
                    onClick={() => { setSelected(n); close(); }}
                  >
                    {seasonLabel(n)}
                  </MenuItem>
                ))}
              </FilterMenu>
            </div>
          )}
        </>
      )}

      {!panel && seasonNumbers.length > 1 && (
        <div className="flex overflow-x-auto no-scrollbar" style={{ borderBottom: '1px solid var(--line)' }}>
          {seasonNumbers.map(n => (
            <button
              key={n}
              onClick={() => setSelected(n)}
              className="flex-shrink-0 px-4 py-2.5 text-sm transition-colors"
              style={{
                color: active === n ? 'var(--text)' : 'var(--text-dim)',
                fontWeight: active === n ? 600 : 400,
                boxShadow: active === n ? 'inset 0 -2px 0 var(--accent)' : 'none',
              }}
            >
              {seasonLabel(n)}
            </button>
          ))}
        </div>
      )}

      <ul
        ref={listRef}
        className="relative overflow-y-auto no-scrollbar flex-1 min-h-0"
        style={{
          maxHeight: panel ? undefined : '68vh',
          borderTop: panel ? '1px solid var(--line)' : undefined,
        }}
      >
        {rows.map(file => {
          const isCurrent = sameUrl(file.url, currentUrl);
          const episode = file.episode ? tmdbEpisodes[file.episode] : null;
          const ratio = progress?.get(normalizeFileUrl(file.url)) ?? 0;
          const watched = ratio >= 0.95;

          const label = episode?.name || episodeName(file.name) || cleanName(file.name);
          const rating = episode?.vote_average
            ? Math.round(episode.vote_average * 10) / 10
            : null;

          return (
            <li key={file.url}>
              <div
                role="button"
                tabIndex={0}
                data-current={isCurrent}
                onClick={() => open(file)}
                onKeyDown={e => onRowKey(e, file)}
                aria-current={isCurrent ? 'true' : undefined}
                title={file.name}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer"
                style={{
                  background: isCurrent
                    ? 'color-mix(in srgb, var(--accent) 9%, var(--ink-800))'
                    : 'transparent',
                }}
                {...dragLinkProps(file.url, file.name)}
              >
                {panel && (
                  <span
                    className="w-5 flex-shrink-0 text-center mono text-[12px]"
                    style={{ color: isCurrent ? 'var(--accent)' : 'var(--text-faint)' }}
                  >
                    {file.episode ?? ''}
                  </span>
                )}

                <span
                  className={`relative flex-shrink-0 rounded overflow-hidden flex items-center justify-center ${panel ? 'w-28' : 'w-20 h-12'}`}
                  style={{ background: 'var(--ink-850)', aspectRatio: panel ? '16 / 9' : undefined }}
                >
                  {episode?.still ? (
                    <FadeImg src={episode.still} loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <Play size={14} style={{ color: 'var(--text-faint)' }} aria-hidden="true" />
                  )}
                  {isCurrent && (
                    <span
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ background: 'color-mix(in srgb, var(--accent) 30%, transparent)' }}
                    >
                      <Play size={13} fill="var(--accent)" strokeWidth={0} aria-hidden="true" />
                    </span>
                  )}
                  {ratio > 0 && (
                    <span className="absolute inset-x-0 bottom-0 h-[3px]" style={{ background: 'rgba(255,255,255,0.14)' }}>
                      <span
                        className="block h-full"
                        style={{
                          width: `${Math.max(ratio * 100, 6)}%`,
                          background: watched ? 'var(--text-faint)' : 'var(--accent)',
                        }}
                      />
                    </span>
                  )}
                </span>

                <span className="flex-1 min-w-0">
                  <span className="flex items-baseline gap-1.5">
                    {!panel && file.episode != null && (
                      <span className="mono text-[10px] font-semibold flex-shrink-0" style={{ color: 'var(--accent)' }}>
                        {file.season ? `S${pad(file.season)}` : ''}E{pad(file.episode)}
                      </span>
                    )}
                    <span
                      className={`truncate ${panel ? 'text-[13.5px]' : 'text-xs'}`}
                      style={{
                        color: isCurrent ? 'var(--text)' : watched ? 'var(--text-dim)' : 'var(--text-soft)',
                        fontWeight: isCurrent ? 600 : 400,
                      }}
                    >
                      {label}
                    </span>
                  </span>

                  <span className="flex items-center gap-2.5 mt-1 data">
                    {isCurrent ? (
                      <span style={{ color: 'var(--accent)' }}>Now playing</span>
                    ) : watched ? (
                      <span className="inline-flex items-center gap-1" style={{ color: 'var(--text-faint)' }}>
                        <Check size={11} aria-hidden="true" />Watched
                      </span>
                    ) : (
                      <>
                        {rating && <span style={{ color: 'var(--accent-light)' }}>{rating}</span>}
                        {episode?.runtime && <span>{episode.runtime}m</span>}
                        {file.size && <span>{file.size}</span>}
                      </>
                    )}
                  </span>
                </span>

              </div>
            </li>
          );
        })}
      </ul>

      {panel && onAutoplayChange && (
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--line)' }}>
          <Switch checked={autoplay} onChange={onAutoplayChange}>Play next automatically</Switch>
        </div>
      )}
    </div>
  );
}

function groupBySeason(files) {
  const groups = {};
  for (const file of orderEpisodes(files)) {
    (groups[file.season ?? 0] ||= []).push(file);
  }
  return groups;
}

function cleanName(name) {
  const parsed = parseRelease(name);
  return parsed.title || name.replace(/\.[^.]+$/, '');
}

function pad(n) {
  return String(n).padStart(2, '0');
}
