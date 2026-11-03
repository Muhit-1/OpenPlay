// src/components/HistoryList.jsx
//
// Everything you have played, with a way to find it again: filter by type,
// search by title, and fold a show's episodes into one entry.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { History as HistoryIcon, Search, X, ChevronDown, Play, SearchX } from 'lucide-react';
import { EmptyState } from './ui';
import { Switch } from './FilterMenu';
import { getContinueWatching } from '../lib/firebase';
import { useAsync } from '../lib/useAsync';
import { dragLinkProps } from '../lib/drag';
import { basename } from '../lib/text';
import { getItem, setItem } from '../lib/storage';
import {
  KINDS, KIND_LABELS, groupHistory, kindOf, episodeTag, episodeName,
  progressOf, isFinished, timeLeft, formatClock, watchedMs, dayBucket,
} from '../lib/history';

const KIND_PILL = { movie: 'Movie', series: 'Series', animation: 'Animation' };

export default function HistoryList() {
  const { data: items, loading } = useAsync('history', () => getContinueWatching(300).catch(() => []), []);

  const [kind, setKind] = useState('all');
  const [query, setQuery] = useState('');
  const [grouped, setGrouped] = useState(() => getItem('history_grouped') !== 'off');
  const [expanded, setExpanded] = useState(() => new Set());

  const changeGrouped = on => {
    setGrouped(on);
    setItem('history_grouped', on ? 'on' : 'off');
  };

  const toggle = key => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  // Kind of every row, computed once.
  const kinds = useMemo(() => new Map(items.map(i => [i.fileUrl, kindOf(i)])), [items]);

  const counts = useMemo(() => {
    const out = {};
    for (const k of KINDS) {
      const rows = k === 'all' ? items : items.filter(i => kinds.get(i.fileUrl) === k);
      out[k] = groupHistory(rows, { group: grouped }).length;
    }
    return out;
  }, [items, kinds, grouped]);

  const entries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = items.filter(i =>
      (kind === 'all' || kinds.get(i.fileUrl) === kind) &&
      (!needle || (i.title || basename(i.fileUrl)).toLowerCase().includes(needle))
    );
    return groupHistory(rows, { group: grouped });
  }, [items, kinds, kind, query, grouped]);

  // Day headings, in the order the entries already come.
  const sections = useMemo(() => {
    const out = [];
    for (const entry of entries) {
      const label = dayBucket(watchedMs(entry.lead));
      const last = out[out.length - 1];
      if (last?.label === label) last.entries.push(entry);
      else out.push({ label, entries: [entry] });
    }
    return out;
  }, [entries]);

  if (loading) {
    return (
      <div className="space-y-2.5">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={HistoryIcon}
        title="Nothing watched yet"
        hint="Play something and it will show up here with your position saved."
      />
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="segmented" role="tablist" aria-label="Filter by type">
          {KINDS.map(k => (
            <button
              key={k}
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
            >
              {KIND_LABELS[k]}
              <span
                className="mono text-[11px]"
                style={{ color: kind === k ? 'var(--accent-light)' : 'var(--text-faint)' }}
              >
                {counts[k]}
              </span>
            </button>
          ))}
        </div>

        <label className="control flex items-center gap-2 px-3 h-10 flex-1 min-w-[200px] max-w-sm">
          <Search size={15} style={{ color: 'var(--text-dim)' }} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search your history"
            aria-label="Search your history"
            className="flex-1 bg-transparent text-[14.5px] outline-none min-w-0"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search" style={{ color: 'var(--text-dim)' }}>
              <X size={14} />
            </button>
          )}
        </label>

        <div className="sm:ml-auto">
          <Switch checked={grouped} onChange={changeGrouped}>Group episodes by show</Switch>
        </div>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="Nothing matches"
          hint="Try another type, or clear the search."
        />
      ) : (
        sections.map(section => (
          <section key={section.label} className="mb-6">
            <h2 className="eyebrow mb-2.5">{section.label}</h2>
            <ul className="space-y-2">
              {section.entries.map(entry => (
                <Entry
                  key={entry.key}
                  entry={entry}
                  open={expanded.has(entry.key)}
                  onToggle={() => toggle(entry.key)}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}

function useOpenFile() {
  const navigate = useNavigate();
  return item => navigate(`/watch/${encodeURIComponent(item.fileUrl)}`, {
    state: { file: { name: item.title || basename(item.fileUrl), url: item.fileUrl, type: 'video' } },
  });
}

/** Click or Enter/Space on a div acting as a button. */
function activate(handler) {
  return {
    role: 'button',
    tabIndex: 0,
    onClick: handler,
    onKeyDown: e => {
      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        handler();
      }
    },
  };
}

function Entry({ entry, open, onToggle }) {
  const openFile = useOpenFile();
  const { lead, others, kind, show } = entry;

  const name = lead.title || basename(lead.fileUrl);
  const detail = [episodeTag(name), episodeName(name)].filter(Boolean).join(' · ')
    || (kind === 'movie' ? '' : 'Episode');
  const finished = isFinished(lead);

  return (
    <li>
      <div
        {...activate(() => openFile(lead))}
        title={name}
        className="panel flex items-center gap-4 p-2.5 pr-3 cursor-pointer transition-colors hover:border-[var(--line-bright)]"
        {...dragLinkProps(lead.fileUrl, name)}
      >
        <span
          className="flex-shrink-0 w-14 h-20 rounded-lg overflow-hidden flex items-center justify-center"
          style={{ background: 'var(--ink-800)', border: '1px solid var(--line)' }}
        >
          {lead.poster
            ? <img src={lead.poster} alt="" loading="lazy" draggable={false} className="w-full h-full object-cover" />
            : <Play size={16} style={{ color: 'var(--text-faint)' }} aria-hidden="true" />}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2.5 flex-wrap">
            <span className="text-[15.5px] font-semibold truncate">{show}</span>
            <span className="pill">{KIND_PILL[kind]}</span>
          </span>
          {detail && (
            <span className="block text-[13.5px] mt-0.5 truncate" style={{ color: 'var(--text-soft)' }}>{detail}</span>
          )}

          {lead.durationSeconds > 0 && (
            <span className="flex items-center gap-3 mt-2 max-w-[520px]">
              <span className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--ink-700)' }}>
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${Math.max(progressOf(lead) * 100, 3)}%`,
                    background: finished ? 'var(--ok)' : 'var(--accent)',
                  }}
                />
              </span>
              <span className="data whitespace-nowrap" style={{ textTransform: 'none' }}>
                {finished
                  ? 'Finished'
                  : `${formatClock(lead.progressSeconds)} of ${formatClock(lead.durationSeconds)} · ${timeLeft(lead)}`}
              </span>
            </span>
          )}
        </span>

        {others.length > 0 && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onToggle(); }}
            aria-expanded={open}
            className="control flex items-center gap-1.5 px-3 h-8 text-[13px] flex-shrink-0"
            style={{ color: 'var(--text-soft)' }}
          >
            {others.length} more episode{others.length === 1 ? '' : 's'}
            <ChevronDown
              size={14}
              aria-hidden="true"
              style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s ease' }}
            />
          </button>
        )}
      </div>

      {open && others.length > 0 && (
        <ul className="ml-[72px] mt-1 mb-2 pl-4 space-y-0.5" style={{ borderLeft: '1px solid var(--line)' }}>
          {others.map(item => <OtherEpisode key={item.fileUrl} item={item} />)}
        </ul>
      )}
    </li>
  );
}

function OtherEpisode({ item }) {
  const openFile = useOpenFile();
  const name = item.title || basename(item.fileUrl);
  const label = [episodeTag(name), episodeName(name)].filter(Boolean).join(' · ') || name;

  return (
    <li>
      <div
        {...activate(() => openFile(item))}
        className="flex items-center gap-4 px-2 py-2 rounded-lg cursor-pointer transition-colors hover:bg-[var(--ink-850)]"
        {...dragLinkProps(item.fileUrl, name)}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] truncate">{label}</span>
          <span className="block mono text-[11px] truncate" style={{ color: 'var(--text-faint)' }}>{name}</span>
        </span>
        <span className="data whitespace-nowrap" style={{ textTransform: 'none' }}>
          {isFinished(item) ? 'Finished' : `${formatClock(item.progressSeconds)} of ${formatClock(item.durationSeconds)}`}
        </span>
      </div>
    </li>
  );
}
