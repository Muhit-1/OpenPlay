// src/components/EpisodeList.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchSeasonEpisodes } from '../lib/tmdb';

function groupBySeasons(files) {
  const seasons = {};
  for (const f of files) {
    const m = f.name.match(/[Ss](\d{1,2})[Ee](\d{1,2})/);
    const season = m ? parseInt(m[1], 10) : 0;
    const ep     = m ? parseInt(m[2], 10) : null;
    if (!seasons[season]) seasons[season] = [];
    seasons[season].push({ ...f, seasonNum: season, epNum: ep });
  }
  return seasons;
}

export default function EpisodeList({ files = [], currentUrl, showMeta = null }) {
  const navigate   = useNavigate();
  const seasons    = groupBySeasons(files);
  const seasonNums = Object.keys(seasons).map(Number).sort((a, b) => a - b);
  const [activeSeason, setActiveSeason] = useState(seasonNums[0] ?? 0);
  // Map of epNum → TMDB episode detail { name, rating, runtime, still, overview }
  const [epDetails, setEpDetails] = useState({});

  // Fetch TMDB episode details when we have showMeta + a real season
  useEffect(() => {
    if (!showMeta?.id || activeSeason === 0) return;
    fetchSeasonEpisodes(showMeta.id, activeSeason)
      .then(eps => {
        if (!Array.isArray(eps)) return;
        const map = {};
        for (const ep of eps) { map[ep.episode_number] = ep; }
        setEpDetails(map);
      })
      .catch(() => {});
  }, [showMeta?.id, activeSeason]);

  if (files.length === 0) return null;

  const activeFiles = seasons[activeSeason] || [];

  return (
    <div className="bg-zinc-900 rounded-xl overflow-hidden">
      {/* Season tabs */}
      {seasonNums.length > 1 && (
        <div className="flex overflow-x-auto border-b border-zinc-800">
          {seasonNums.map(s => (
            <button
              key={s}
              onClick={() => setActiveSeason(s)}
              className={`flex-shrink-0 px-4 py-3 text-sm font-medium transition-colors ${
                activeSeason === s
                  ? 'text-white border-b-2 border-[var(--accent)]'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {s === 0 ? 'Episodes' : `S${s}`}
            </button>
          ))}
        </div>
      )}

      {/* Episode rows */}
      <div className="overflow-y-auto max-h-[68vh]">
        {activeFiles.map((file) => {
          const isCurrent = file.url === currentUrl;
          const epLabel   = file.epNum ? `E${String(file.epNum).padStart(2, '0')}` : null;
          const tmdbEp    = file.epNum ? epDetails[file.epNum] : null;

          const cleanName = file.name
            .replace(/\.[^.]+$/, '')
            .replace(/[._]/g, ' ')
            .replace(/[Ss]\d+[Ee]\d+.*/i, '')
            .trim();

          const displayName = tmdbEp?.name || cleanName || file.name;
          const epRating    = tmdbEp?.vote_average
            ? Math.round(tmdbEp.vote_average * 10) / 10
            : null;
          const epRuntime   = tmdbEp?.runtime || null;
          const epStill     = tmdbEp?.still_path
            ? `https://image.tmdb.org/t/p/w300${tmdbEp.still_path}`
            : null;

          return (
            <button
              key={file.url}
              onClick={() => navigate(`/watch/${encodeURIComponent(file.url)}`, { state: { file } })}
              className={`w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-zinc-800 transition-colors ${
                isCurrent ? 'bg-zinc-800/80 border-l-2 border-[var(--accent)]' : 'border-l-2 border-transparent'
              }`}
            >
              {/* Episode still or placeholder */}
              <div className="flex-shrink-0 w-20 h-12 rounded overflow-hidden bg-zinc-800 relative">
                {epStill ? (
                  <img src={epStill} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg className="w-6 h-6 text-zinc-600" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                )}
                {isCurrent && (
                  <div className="absolute inset-0 bg-[var(--accent)]/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-[var(--accent)]" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Text content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  {epLabel && (
                    <span className="text-[10px] font-mono text-[var(--accent)] font-semibold flex-shrink-0">
                      {epLabel}
                    </span>
                  )}
                  <span className={`text-xs truncate font-medium ${isCurrent ? 'text-white' : 'text-zinc-200'}`}>
                    {displayName}
                  </span>
                </div>
                {/* Rating + runtime row */}
                <div className="flex items-center gap-2">
                  {epRating && (
                    <span className="text-yellow-400 text-[10px] font-semibold">★ {epRating}</span>
                  )}
                  {epRuntime && (
                    <span className="text-zinc-500 text-[10px]">{epRuntime}m</span>
                  )}
                  {tmdbEp?.overview && !epRating && (
                    <span className="text-zinc-500 text-[10px] truncate">{tmdbEp.overview.slice(0, 60)}…</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}