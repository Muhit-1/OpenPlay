// shared/title.js
//
// Title normalisation and matching, used by both the browser (ISP folder
// matching) and api/tmdb.js (TMDB result ranking). It lives outside `src/` and
// `api/` so neither bundle has to reach into the other, and the two can no
// longer drift apart.

/** Normalise a title for comparison: lowercase, no punctuation, no leading article. */
export function normaliseTitle(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/['‘’`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/^(the|a|an)\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Score how well a candidate title matches a wanted title. 0 = no match, 1 = exact.
 * Used both for TMDB result ranking and for folder matching on the ISP server.
 */
export function titleScore(candidate, wanted) {
  const a = normaliseTitle(candidate);
  const b = normaliseTitle(wanted);
  if (!a || !b) return 0;
  if (a === b) return 1;

  // One is a clean prefix of the other ("Dune" vs "Dune Part Two") — related
  // but not the same film, so score it well below an exact match.
  if (a.startsWith(b + ' ') || b.startsWith(a + ' ')) return 0.72;

  const aWords = a.split(' ');
  const bWords = new Set(b.split(' '));
  const hits   = aWords.filter(w => bWords.has(w)).length;
  const recall = hits / Math.max(aWords.length, bWords.size);

  return recall >= 0.8 ? 0.65 * recall : recall * 0.5;
}
