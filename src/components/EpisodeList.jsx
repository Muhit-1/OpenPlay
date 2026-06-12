// src/components/EpisodeList.jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Groups an array of file objects by detected season number.
 * Falls back to a single "Episodes" group if no season is found.
 */
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

export default function EpisodeList({ files = [], currentUrl }) {
  const navigate = useNavigate();
  const seasons  = groupBySeasons(files);
  const seasonNums = Object.keys(seasons).map(Number).sort((a, b) => a - b);
  const [activeSeason, setActiveSeason] = useState(seasonNums[0] ?? 0);

  if (files.length === 0) return null;

  const activeFiles = seasons[activeSeason] || [];

  return (
    <div className="bg-zinc-900 rounded-xl overflow-hidden">
      {/* Season selector */}
      {seasonNums.length > 1 && (
        <div className="flex overflow-x-auto border-b border-zinc-700">
          {seasonNums.map(s => (
            <button
              key={s}
              onClick={() => setActiveSeason(s)}
              className={`flex-shrink-0 px-4 py-3 text-sm font-medium transition-colors ${
                activeSeason === s
                  ? 'text-white border-b-2 border-red-500'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {s === 0 ? 'Episodes' : `Season ${s}`}
            </button>
          ))}
        </div>
      )}

      {/* Episode list */}
      <div className="overflow-y-auto max-h-[60vh]">
        {activeFiles.map((file) => {
          const isCurrent = file.url === currentUrl;
          const epLabel   = file.epNum ? `E${String(file.epNum).padStart(2, '0')}` : null;
          const cleanName = file.name
            .replace(/\.[^.]+$/, '')
            .replace(/[._]/g, ' ')
            .replace(/[Ss]\d+[Ee]\d+.*/, '')
            .trim();

          return (
            <button
              key={file.url}
              onClick={() => navigate(`/watch/${encodeURIComponent(file.url)}`, { state: { file } })}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-700 transition-colors ${
                isCurrent ? 'bg-zinc-700 border-l-2 border-red-500' : ''
              }`}
            >
              {epLabel && (
                <span className="flex-shrink-0 text-xs font-mono text-red-400 w-8">{epLabel}</span>
              )}
              <span className={`text-sm truncate ${isCurrent ? 'text-white font-medium' : 'text-zinc-300'}`}>
                {cleanName || file.name}
              </span>
              {isCurrent && (
                <svg className="flex-shrink-0 w-4 h-4 text-red-500 ml-auto" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}