// src/components/EpisodeList.jsx
// The other videos in the same folder, grouped into seasons when they name one.

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play } from 'lucide-react';
import { fetchSeasonEpisodes } from '../lib/tmdb';
import { parseRelease } from '../lib/release';
import { useAsync } from '../lib/useAsync';

export default function EpisodeList({ files = [], currentUrl, showMeta = null }) {
  const navigate = useNavigate();

  const seasons = useMemo(() => groupBySeason(files), [files]);
  const seasonNumbers = useMemo(
    () => Object.keys(seasons).map(Number).sort((a, b) => a - b),
    [seasons]
  );

  const [selected, setSelected] = useState(null);

  // Derived rather than stored, so a change of file list cannot leave the tab
  // pointing at a season that no longer exists.
  const active = seasonNumbers.includes(selected) ? selected : (seasonNumbers[0] ?? 0);

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

  if (files.length === 0) return null;

  const rows = seasons[active] || [];

  return (
    <div className="panel overflow-hidden">
      {seasonNumbers.length > 1 && (
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
              {n === 0 ? 'Files' : `Season ${n}`}
            </button>
          ))}
        </div>
      )}

      <ul className="overflow-y-auto no-scrollbar" style={{ maxHeight: '68vh' }}>
        {rows.map(file => {
          const isCurrent = file.url === currentUrl;
          const episode = file.episode ? tmdbEpisodes[file.episode] : null;

          const label = episode?.name || cleanName(file.name);
          const rating = episode?.vote_average
            ? Math.round(episode.vote_average * 10) / 10
            : null;

          return (
            <li key={file.url}>
              <button
                onClick={() => navigate(`/watch/${encodeURIComponent(file.url)}`, { state: { file } })}
                className="w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors"
                style={{
                  background: isCurrent ? 'var(--ink-850)' : 'transparent',
                  boxShadow: isCurrent ? 'inset 2px 0 0 var(--accent)' : 'none',
                }}
              >
                <span
                  className="relative flex-shrink-0 w-20 h-12 rounded overflow-hidden flex items-center justify-center"
                  style={{ background: 'var(--ink-800)' }}
                >
                  {episode?.still ? (
                    <img src={episode.still} alt="" loading="lazy" className="w-full h-full object-cover" />
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
                </span>

                <span className="flex-1 min-w-0">
                  <span className="flex items-baseline gap-1.5">
                    {file.episode != null && (
                      <span className="mono text-[10px] font-semibold flex-shrink-0" style={{ color: 'var(--accent)' }}>
                        {file.season ? `S${pad(file.season)}` : ''}E{pad(file.episode)}
                      </span>
                    )}
                    <span
                      className="text-xs truncate"
                      style={{ color: isCurrent ? 'var(--text)' : 'var(--text-soft)', fontWeight: isCurrent ? 600 : 400 }}
                    >
                      {label}
                    </span>
                  </span>

                  <span className="flex items-center gap-2.5 mt-1 data">
                    {rating && <span style={{ color: 'var(--accent-light)' }}>{rating}</span>}
                    {episode?.runtime && <span>{episode.runtime}m</span>}
                    {file.size && <span>{file.size}</span>}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function groupBySeason(files) {
  const groups = {};
  for (const file of files) {
    const parsed = parseRelease(file.name);
    const season = parsed.season ?? 0;
    (groups[season] ||= []).push({ ...file, season: parsed.season, episode: parsed.episode });
  }
  for (const list of Object.values(groups)) {
    list.sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0) || a.name.localeCompare(b.name));
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
