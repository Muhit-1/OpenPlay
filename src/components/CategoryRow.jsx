// src/components/CategoryRow.jsx
import { useRef } from 'react';
import VideoCard from './VideoCard';

export default function CategoryRow({ title, files = [], folders = [], onFolderClick }) {
  const scrollRef = useRef(null);

  const scroll = (dir) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir * 600, behavior: 'smooth' });
    }
  };

  if (files.length === 0 && folders.length === 0) return null;

  return (
    <section className="mb-10">
      {/* Row header */}
      <div className="flex items-center justify-between mb-3 px-6">
        <h2 className="text-white text-xl font-semibold tracking-wide">{title}</h2>
        <div className="flex gap-2">
          <button
            onClick={() => scroll(-1)}
            className="p-1.5 rounded-full bg-zinc-700 hover:bg-zinc-600 text-white transition-colors"
            aria-label="Scroll left"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => scroll(1)}
            className="p-1.5 rounded-full bg-zinc-700 hover:bg-zinc-600 text-white transition-colors"
            aria-label="Scroll right"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Scrollable track */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scroll-smooth no-scrollbar px-6 pb-2"
        style={{ scrollbarWidth: 'none' }}
      >
        {/* Folder cards */}
        {folders.map(folder => (
          <button
            key={folder.url}
            onClick={() => onFolderClick?.(folder)}
            className="flex-shrink-0 w-44 h-64 rounded-lg bg-zinc-700 hover:bg-zinc-600 hover:ring-2 hover:ring-red-500 transition-all flex flex-col items-center justify-center gap-3 text-white"
          >
            <svg className="w-14 h-14 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
            </svg>
            <span className="text-sm font-medium text-center px-3 leading-tight">{folder.name}</span>
          </button>
        ))}

        {/* Video cards */}
        {files.map(file => (
          <VideoCard key={file.url} file={file} />
        ))}
      </div>
    </section>
  );
}