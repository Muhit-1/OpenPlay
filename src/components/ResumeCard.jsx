// src/components/ResumeCard.jsx
//
// One card per show or film in "Continue watching": the latest thing you were
// partway through, how far along it is, and how many other episodes you have
// started. It replaces a row of near-identical posters, one per episode.

import { useNavigate } from 'react-router-dom';
import { Play, GripVertical } from 'lucide-react';
import { dragLinkProps } from '../lib/drag';
import { FadeImg } from './ui';
import { basename } from '../lib/text';
import {
  episodeTag, episodeName, progressOf, timeLeft,
} from '../lib/history';

const KIND_LABEL = { movie: 'Film', series: 'Series', animation: 'Animation' };

export default function ResumeCard({ group }) {
  const navigate = useNavigate();
  const { lead, others, kind, show } = group;

  const name = lead.title || basename(lead.fileUrl);
  const tag = episodeTag(name);
  const epName = episodeName(name);
  const ratio = progressOf(lead);

  const open = () =>
    navigate(`/watch/${encodeURIComponent(lead.fileUrl)}`, {
      state: { file: { name, url: lead.fileUrl, type: 'video' } },
    });

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={e => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          open();
        }
      }}
      title={name}
      className="resume-card panel grab-host group relative flex gap-4 p-3 text-left cursor-pointer"
      {...dragLinkProps(lead.fileUrl, name)}
    >
      <span className="grab-label" style={{ left: 'auto', right: 10, top: 10 }}>
        <GripVertical size={11} aria-hidden="true" />
        Drag to VLC
      </span>

      <span
        className="relative flex-shrink-0 w-[84px] h-[124px] rounded-lg overflow-hidden flex items-center justify-center"
        style={{ background: 'var(--ink-800)', border: '1px solid var(--line)' }}
      >
        {lead.poster
          ? <FadeImg src={lead.poster} loading="lazy" className="w-full h-full object-cover" />
          : <Play size={18} style={{ color: 'var(--text-faint)' }} aria-hidden="true" />}
        <span className="resume-play" aria-hidden="true">
          <Play size={14} fill="currentColor" strokeWidth={0} />
        </span>
      </span>

      <span className="min-w-0 flex-1 flex flex-col justify-center py-1">
        <span className="font-display text-[17px] leading-tight truncate">{show}</span>
        <span className="text-[13.5px] mt-1 truncate" style={{ color: 'var(--text-soft)' }}>
          {[tag, epName].filter(Boolean).join(' · ') || 'Resume'}
        </span>

        <span className="block mt-3">
          <span className="block h-1 rounded-full overflow-hidden" style={{ background: 'var(--ink-700)' }}>
            <span
              className="block h-full rounded-full"
              style={{ width: `${Math.max(ratio * 100, 3)}%`, background: 'var(--accent)' }}
            />
          </span>
          <span className="block data mt-1.5">{timeLeft(lead)}</span>
        </span>

        <span className="flex flex-wrap items-center gap-1.5 mt-2.5">
          <span className="pill">{KIND_LABEL[kind] || 'Video'}</span>
          {others.length > 0 && (
            <span className="pill">{others.length} more started</span>
          )}
        </span>
      </span>
    </div>
  );
}
