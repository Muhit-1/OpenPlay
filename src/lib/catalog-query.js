// src/lib/catalog-query.js
//
// Filtering and sorting the catalogue index. Pure functions, no I/O, so the
// rules are easy to read and to test.

export const RATINGS = [
  { key: 0, label: 'Any rating' },
  { key: 6, label: '6+' },
  { key: 7, label: '7+' },
  { key: 8, label: '8+' },
];

export const YEARS = [
  { key: 'all',   label: 'Any year' },
  { key: '2020s', label: '2020s', from: 2020, to: 2029 },
  { key: '2010s', label: '2010s', from: 2010, to: 2019 },
  { key: '2000s', label: '2000s', from: 2000, to: 2009 },
  { key: '1990s', label: '1990s', from: 1990, to: 1999 },
  { key: 'older', label: 'Before 1990', from: 0, to: 1989 },
];

export const SORTS = [
  { key: 'server',  label: 'Server order', needsIndex: false },
  { key: 'az',      label: 'Title A–Z', needsIndex: false },
  { key: 'newest',  label: 'Newest first', needsIndex: true },
  { key: 'top',     label: 'Top rated', needsIndex: true },
  { key: 'popular', label: 'Most voted', needsIndex: true },
];

/** A rating from a handful of votes is noise; "top rated" needs a crowd. */
export const MIN_VOTES_FOR_TOP = 100;

const title = r => r.title || r.name || '';
const byTitle = (a, b) =>
  title(a).localeCompare(title(b), undefined, { numeric: true, sensitivity: 'base' });

/** True if a filter that only the index can answer is in use. */
export function needsIndex({ genre, minRating, year, language, sort } = {}) {
  return Boolean(
    genre || minRating || (year && year !== 'all') || language ||
    SORTS.find(s => s.key === sort)?.needsIndex
  );
}

/**
 * @param {Array} records   catalogue index records
 * @param {object} f        { genre, minRating, year, language, sort, text }
 */
export function queryCatalog(records, f = {}) {
  const { genre = null, minRating = 0, year = 'all', language = null, sort = 'server', text = '' } = f;
  const range = YEARS.find(y => y.key === year);
  const needle = text.trim().toLowerCase();

  const filtering = Boolean(genre || minRating || (range && range.from !== undefined) || language);

  let out = records.filter(r => {
    // Unmatched titles have no genre, rating or year, so any such filter excludes them.
    if (filtering && !r.found) return false;
    if (genre && !r.genres?.includes(genre)) return false;
    if (minRating && !((r.rating ?? 0) >= minRating)) return false;
    if (range && range.from !== undefined && !(r.year >= range.from && r.year <= range.to)) return false;
    if (language && r.language !== language) return false;
    if (needle && !(r.name.toLowerCase().includes(needle) || title(r).toLowerCase().includes(needle))) return false;
    return true;
  });

  switch (sort) {
    case 'az':
      out = [...out].sort(byTitle);
      break;
    case 'newest':
      out = [...out].sort((a, b) => (b.year ?? -1) - (a.year ?? -1) || byTitle(a, b));
      break;
    case 'popular':
      out = [...out].sort((a, b) => (b.votes ?? -1) - (a.votes ?? -1) || byTitle(a, b));
      break;
    case 'top':
      out = [...out].sort((a, b) => {
        const ra = (a.votes ?? 0) >= MIN_VOTES_FOR_TOP, rb = (b.votes ?? 0) >= MIN_VOTES_FOR_TOP;
        if (ra !== rb) return ra ? -1 : 1;                       // reliable ratings first
        return (b.rating ?? -1) - (a.rating ?? -1) || (b.votes ?? 0) - (a.votes ?? 0) || byTitle(a, b);
      });
      break;
    default:
      break;                                                   // keep server order
  }
  return out;
}

/** Counts per genre / language across the index, most common first. */
export function facets(records) {
  const genres = new Map(), languages = new Map();
  for (const r of records) {
    if (!r.found) continue;
    for (const g of r.genres || []) genres.set(g, (genres.get(g) || 0) + 1);
    if (r.language) languages.set(r.language, (languages.get(r.language) || 0) + 1);
  }
  const rank = m => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { genres: rank(genres), languages: rank(languages) };
}
