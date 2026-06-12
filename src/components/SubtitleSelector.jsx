// src/components/SubtitleSelector.jsx

/**
 * SubtitleSelector — shows a dropdown of available subtitle tracks
 * and calls onSelect(track) when the user picks one.
 *
 * `tracks` is an array of:
 *   { label: string, language: string, src: string, kind: 'subtitles'|'captions' }
 *
 * Pass tracks={[]} to render nothing.
 */
export default function SubtitleSelector({ tracks = [], activeSrc, onSelect }) {
  if (tracks.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <svg className="w-4 h-4 text-zinc-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
      </svg>

      <select
        value={activeSrc || ''}
        onChange={e => {
          const selected = tracks.find(t => t.src === e.target.value) || null;
          onSelect(selected);
        }}
        className="bg-zinc-800 text-white text-sm rounded px-2 py-1 border border-zinc-600 focus:outline-none focus:ring-1 focus:ring-red-500"
      >
        <option value="">Off</option>
        {tracks.map(t => (
          <option key={t.src} value={t.src}>{t.label}</option>
        ))}
      </select>
    </div>
  );
}