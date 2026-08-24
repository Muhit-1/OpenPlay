// src/pages/MyList.jsx
// History and Watchlist — both are "a saved list of things", so both live here.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, Bookmark, Trash2, Play } from 'lucide-react';
import { EmptyState, Rating } from '../components/ui';
import { getContinueWatching, getBookmarks, removeBookmark } from '../lib/firebase';
import { useAsync } from '../lib/useAsync';
import { describeMedia, mediaSummary } from '../lib/playback';

export default function MyList({ mode }) {
  const isHistory = mode === 'history';
  const [version, setVersion] = useState(0);

  const { data: items, loading } = useAsync(
    `${mode}|${version}`,
    () => (isHistory ? getContinueWatching(60) : getBookmarks()).catch(() => []),
    []
  );

  const drop = async fileUrl => {
    await removeBookmark(fileUrl).catch(() => {});
    setVersion(v => v + 1);
  };

  return (
    <div className="page-enter px-5 sm:px-7 py-7">
      <header className="mb-7">
        <p className="eyebrow mb-2">Yours</p>
        <h1 className="font-display text-3xl">{isHistory ? 'History' : 'Watchlist'}</h1>
        <p className="text-[15px] mt-2" style={{ color: 'var(--text-dim)' }}>
          {isHistory
            ? 'Everything you have played, newest first. Pick up where you stopped.'
            : 'Titles you saved to come back to.'}
        </p>
      </header>

      {loading ? (
        <div className="space-y-2.5">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skeleton h-20 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={isHistory ? History : Bookmark}
          title={isHistory ? 'Nothing watched yet' : 'Watchlist is empty'}
          hint={
            isHistory
              ? 'Play something and it will show up here with your position saved.'
              : 'Save a title from its detail page to find it here later.'
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {items.map(item => (
            <Entry
              key={item.fileUrl}
              item={item}
              isHistory={isHistory}
              onRemove={isHistory ? null : () => drop(item.fileUrl)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Entry({ item, isHistory, onRemove }) {
  const navigate = useNavigate();
  const media = describeMedia(item.fileUrl);

  const progress = item.durationSeconds
    ? Math.min(100, (item.progressSeconds / item.durationSeconds) * 100)
    : 0;

  const finished = progress > 95;

  return (
    <li className="panel overflow-hidden">
      <div className="flex items-stretch">
        <button
          onClick={() => navigate(`/watch/${encodeURIComponent(item.fileUrl)}`)}
          className="flex items-center gap-4 flex-1 min-w-0 p-3 text-left"
        >
          <span
            className="flex-shrink-0 w-14 h-20 rounded-lg overflow-hidden flex items-center justify-center"
            style={{ background: 'var(--ink-800)' }}
          >
            {item.poster ? (
              <img src={item.poster} alt="" loading="lazy" className="w-full h-full object-cover" />
            ) : (
              <Play size={16} style={{ color: 'var(--text-faint)' }} aria-hidden="true" />
            )}
          </span>

          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium truncate">{item.title}</span>
            <span className="block data mt-1 truncate">{mediaSummary(media) || 'Video'}</span>

            {isHistory && item.durationSeconds > 0 && (
              <span className="block mt-2">
                <span
                  className="block h-1 rounded-full overflow-hidden"
                  style={{ background: 'var(--ink-700)' }}
                >
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${progress}%`,
                      background: finished ? 'var(--ok)' : 'var(--accent)',
                    }}
                  />
                </span>
                <span className="block data mt-1.5">
                  {finished
                    ? 'Finished'
                    : `${formatTime(item.progressSeconds)} of ${formatTime(item.durationSeconds)}`}
                </span>
              </span>
            )}
          </span>

          <Rating value={item.rating} />
        </button>

        {onRemove && (
          <button
            onClick={onRemove}
            aria-label={`Remove ${item.title} from watchlist`}
            className="px-4 flex items-center transition-colors"
            style={{ color: 'var(--text-dim)', borderLeft: '1px solid var(--line)' }}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </li>
  );
}

function formatTime(secs) {
  if (!secs || !Number.isFinite(secs)) return '0:00';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
