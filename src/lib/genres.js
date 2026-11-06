// src/lib/genres.js
//
// TMDB numbers its genres, and films and series use slightly different lists
// ("Science Fiction" vs "Sci-Fi & Fantasy", "Action & Adventure"). The filter
// menu shows one list, so both are folded into the same names.

const MOVIE = {
  28: ['Action'], 12: ['Adventure'], 16: ['Animation'], 35: ['Comedy'], 80: ['Crime'],
  99: ['Documentary'], 18: ['Drama'], 10751: ['Family'], 14: ['Fantasy'], 36: ['History'],
  27: ['Horror'], 10402: ['Music'], 9648: ['Mystery'], 10749: ['Romance'],
  878: ['Sci-Fi'], 53: ['Thriller'], 10752: ['War'], 37: ['Western'],
};

const TV = {
  10759: ['Action', 'Adventure'], 16: ['Animation'], 35: ['Comedy'], 80: ['Crime'],
  99: ['Documentary'], 18: ['Drama'], 10751: ['Family'], 10762: ['Kids'], 9648: ['Mystery'],
  10764: ['Reality'], 10765: ['Sci-Fi', 'Fantasy'], 10768: ['War'], 37: ['Western'],
};

/**
 * Genre names for a list of TMDB genre ids.
 * @param {number[]} ids
 * @param {'movie'|'tv'} type
 * @returns {string[]} unique, in the order TMDB listed them
 */
export function genreNames(ids = [], type = 'movie') {
  const table = type === 'tv' ? TV : MOVIE;
  const names = [];
  for (const id of ids) {
    // A series can carry a movie-style id and vice versa; fall back to the other list.
    for (const name of table[id] || MOVIE[id] || TV[id] || []) {
      if (!names.includes(name)) names.push(name);
    }
  }
  return names;
}

/** "hi" -> "Hindi". Falls back to the code itself. */
export function languageName(code) {
  if (!code) return 'Unknown';
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) || code;
  } catch {
    return code;
  }
}
