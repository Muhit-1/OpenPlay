// src/pages/Channel.jsx
//
// Everything by one genre, or everything by one person.
//
// This page used to scan sessionStorage for keys prefixed "tmdb:" that nothing
// in the app ever wrote — a comment claimed VideoCard saved them, but it never
// did, so every genre and cast chip led to a permanently empty page. It now
// asks TMDB directly, which also means results are complete rather than
// limited to whatever the user happened to have browsed.

import { useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, SearchX } from 'lucide-react';
import PosterCard from '../components/PosterCard';
import { PosterSkeleton, EmptyState } from '../components/ui';
import { fetchByGenre, fetchPerson, fetchPersonByName, fetchCompany } from '../lib/tmdb';
import { useAsync } from '../lib/useAsync';
import { safeDecode } from '../lib/text';

// TMDB genre ids, keyed by the display names that appear on detail pages.
const GENRE_IDS = {
  'Action': 28, 'Adventure': 12, 'Animation': 16, 'Comedy': 35, 'Crime': 80,
  'Documentary': 99, 'Drama': 18, 'Family': 10751, 'Fantasy': 14, 'History': 36,
  'Horror': 27, 'Music': 10402, 'Mystery': 9648, 'Romance': 10749,
  'Science Fiction': 878, 'TV Movie': 10770, 'Thriller': 53, 'War': 10752,
  'Western': 37,
  'Action & Adventure': 10759, 'Kids': 10762, 'News': 10763, 'Reality': 10764,
  'Sci-Fi & Fantasy': 10765, 'Soap': 10766, 'Talk': 10767, 'War & Politics': 10768,
};

export default function Channel() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const type = params.get('type') || 'genre';
  const name = params.get('name') || '';
  const decoded = safeDecode(id);

  const [filter, setFilter] = useState('');

  const empty = { items: [], heading: name || decoded, subtitle: null, profile: null };

  const { data: state, loading } = useAsync(
    `${type}|${decoded}`,
    () => loadChannel(type, decoded, name),
    empty
  );

  const visible = state.items.filter(item => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return item.title?.toLowerCase().includes(f) || item.year?.includes(f);
  });

  return (
    <div className="page-enter px-5 sm:px-7 py-7">
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-2 mb-6 text-sm"
        style={{ color: 'var(--text-dim)' }}
      >
        <ArrowLeft size={15} aria-hidden="true" />
        Back
      </button>

      <header className="flex items-start justify-between flex-wrap gap-4 mb-8">
        <div className="flex items-center gap-4 min-w-0">
          {state.profile && (
            <img
              src={state.profile}
              alt=""
              className="w-16 h-16 rounded-full object-cover flex-shrink-0"
              style={{ border: '1px solid var(--line)' }}
            />
          )}
          <div className="min-w-0">
            <p className="eyebrow mb-1.5">{state.subtitle || type}</p>
            <h1 className="font-display text-3xl truncate">{state.heading}</h1>
            {!loading && (
              <p className="data mt-1.5">
                {state.items.length} title{state.items.length === 1 ? '' : 's'}
              </p>
            )}
          </div>
        </div>

        {state.items.length > 0 && (
          <input
            type="search"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter"
            aria-label="Filter titles"
            className="control px-3.5 h-9 text-sm outline-none w-44"
          />
        )}
      </header>

      {loading ? (
        <div className="flex flex-wrap gap-4">
          {Array.from({ length: 12 }, (_, i) => <PosterSkeleton key={i} />)}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={state.items.length === 0 ? 'Nothing to show' : 'No matches for that filter'}
          hint={
            state.items.length === 0
              ? 'TMDB returned no titles for this page.'
              : 'Try a shorter filter.'
          }
        />
      ) : (
        <div className="flex flex-wrap gap-4">
          {visible.map(item => <PosterCard key={`${item.type}-${item.id}`} item={item} />)}
        </div>
      )}
    </div>
  );
}

/** Resolve a channel to its title list. */
async function loadChannel(type, decoded, name) {
  // A studio is a channel too: Marvel Studios has its films, DC has theirs.
  if (type === 'studio') {
    const [movies, series] = await Promise.all([
      fetchCompany(decoded, 'movie'),
      fetchCompany(decoded, 'tv'),
    ]);
    return {
      items: interleave(movies, series),
      heading: name || 'Studio',
      subtitle: 'Studio',
      profile: null,
    };
  }

  if (type === 'genre') {
    const genreId = GENRE_IDS[decoded];
    if (!genreId) {
      return { items: [], heading: decoded, subtitle: 'Unknown genre', profile: null };
    }
    const [movies, series] = await Promise.all([
      fetchByGenre(genreId, 'movie'),
      fetchByGenre(genreId, 'tv'),
    ]);
    return {
      items: interleave(movies, series),
      heading: decoded,
      subtitle: 'Films and series',
      profile: null,
    };
  }

  // A person, either by TMDB id or by the name shown on a credits line.
  let personId = type === 'person' ? decoded : null;

  if (!personId) {
    const found = await fetchPersonByName(decoded);
    if (!found?.found) {
      return { items: [], heading: decoded, subtitle: 'Not found on TMDB', profile: null };
    }
    personId = found.id;
  }

  const person = await fetchPerson(personId);
  return {
    items: person?.items || [],
    heading: person?.name || decoded,
    subtitle: person?.knownFor || 'Credits',
    profile: person?.profile || null,
  };
}

/** Blend two ranked lists so neither medium dominates the top of the grid. */
function interleave(a, b) {
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}
