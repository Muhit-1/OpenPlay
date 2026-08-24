// src/lib/release.js
//
// Turns a scene / P2P release name into structured metadata.
//
// This is the single most important function in OpenPlay: everything the user
// sees — poster, rating, cast, whether a title is "on the server" — depends on
// getting `title` and `year` out of a string like
//
//   Mercy (2026) 1080p AMZN-WEB x265 HEVC ESub [Dual Audio][Hindi 5.1+English 5.1] -MsMod.mkv
//
// so it is written to be inspected and tested rather than clever.

const MEDIA_EXT = new Set([
  'mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'ts', 'mpg', 'mpeg',
  'm2ts', 'ogv', '3gp', 'divx', 'rmvb', 'm3u8',
]);

// Tokens that mark the end of the title and the start of release metadata.
const TAGS = {
  resolution: /\b(2160p|1440p|1080[pi]|720p|576p|480p|4k|uhd|fhd)\b/i,
  source: /\b(blu-?ray|bd-?rip|bd-?remux|web-?dl|web-?rip|web|hdtv|pdtv|dvd-?rip|dvd-?scr|dvd|hd-?rip|hdcam|cam-?rip|amzn|nf|netflix|dsnp|atvp|hmax|hulu|pmtp|itunes)\b/i,
  videoCodec: /\b(x265|x264|h\.?265|h\.?264|hevc|avc|xvid|divx|av1|vp9)\b/i,
  audioCodec: /\b(ddp?\+?\s?5\.1|dd\+|eac-?3|e-?ac-?3|ac-?3|dts-?hd|dts-?x|dts|truehd|atmos|aac(\s?2\.0|\s?5\.1)?|flac|mp3|opus)\b/i,
  hdr: /\b(hdr10\+?|hdr|dolby\s?vision|dovi|sdr)\b/i,
  depth: /\b(10-?bit|8-?bit|12-?bit)\b/i,
  edition: /\b(remux|proper|repack|extended|unrated|uncut|imax|directors?\.?\s?cut|theatrical|remastered|criterion)\b/i,
  subs: /\b(esubs?|msubs?|subbed|multi\s?subs?|dual\s?audio|multi\s?audio|org\s?aud)\b/i,
};

/** Every tag pattern in one alternation, used to locate where the title ends. */
const ANY_TAG = new RegExp(Object.values(TAGS).map(r => r.source).join('|'), 'i');

const SEASON_EPISODE = /\b[Ss](\d{1,2})[\s._-]?[Ee](\d{1,3})\b|\b(\d{1,2})x(\d{2})\b/;
const SEASON_ONLY    = /\b(?:season[\s._-]*(\d{1,2})|s(\d{1,2}))(?![\s._-]?e\d)\b/i;
const YEAR_PARENS    = /[([](19\d{2}|20\d{2})[)\]]/;
const YEAR_BARE      = /\b(19\d{2}|20\d{2})\b/g;

// Dotted acronyms ("S.W.A.T.", "S.H.I.E.L.D.") must survive dot-to-space
// normalisation, so they are set aside first and restored afterwards.
const ACRONYM  = /\b(?:[A-Za-z]\.){2,}[A-Za-z]?\.?/g;
const SENTINEL = /@@ACR(\d+)@@/g;

/** Strip a trailing media extension, leaving names like "S.W.A.T" intact. */
function stripExtension(name) {
  const dot = name.lastIndexOf('.');
  if (dot === -1) return name;
  const ext = name.slice(dot + 1).toLowerCase();
  return MEDIA_EXT.has(ext) ? name.slice(0, dot) : name;
}

/**
 * Dot-separated scene names ("Dune.Part.Two.2024") need dots turned into
 * spaces; normal names ("Mercy (2026)") must keep theirs.
 */
function normaliseSeparators(name) {
  const acronyms = [];
  const masked = name.replace(ACRONYM, m => `@@ACR${acronyms.push(m) - 1}@@`);

  const dots   = (masked.match(/\./g) || []).length;
  const spaces = (masked.match(/\s/g) || []).length;
  const sceneSeparated = dots > spaces || /_/.test(masked);

  const converted = sceneSeparated
    ? masked.replace(/[._]+/g, ' ')
    : masked.replace(/_/g, ' ');

  return converted.replace(SENTINEL, (_, i) => acronyms[Number(i)]);
}

function cleanTitle(raw) {
  return raw
    .replace(/[([{][^)\]}]*$/, '')       // unclosed bracket left by the cut
    .replace(/[-–—_.\s]+$/, '')          // trailing punctuation
    .replace(/^[-–—_.\s]+/, '')          // leading punctuation
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Parse a release name into structured fields.
 *
 * @param {string} filename  file or folder name
 * @returns {object} structured release metadata
 */
export function parseRelease(filename) {
  const raw = String(filename || '');

  const container = (() => {
    const dot = raw.lastIndexOf('.');
    if (dot === -1) return null;
    const ext = raw.slice(dot + 1).toLowerCase();
    return MEDIA_EXT.has(ext) ? ext : null;
  })();

  const name = normaliseSeparators(stripExtension(raw));

  // ── Season / episode ──
  const se = name.match(SEASON_EPISODE);
  let season = null, episode = null, seIndex = -1;
  if (se) {
    season  = parseInt(se[1] ?? se[3], 10);
    episode = parseInt(se[2] ?? se[4], 10);
    seIndex = se.index;
  } else {
    const so = name.match(SEASON_ONLY);
    if (so) {
      season  = parseInt(so[1] ?? so[2], 10);
      seIndex = so.index;
    }
  }

  // ── Year — a parenthesised year is far more reliable than a bare one ──
  const parens = name.match(YEAR_PARENS);
  let year = null, yearIndex = -1;
  if (parens) {
    year = parens[1];
    yearIndex = parens.index;
  } else {
    // Skip a bare number that is really the whole title ("2012", "1917").
    const bare = [...name.matchAll(YEAR_BARE)].find(m => m.index > 0);
    if (bare) {
      year = bare[1];
      yearIndex = bare.index;
    }
  }

  // ── Where does the title end? At the earliest metadata marker. ──
  const tagMatch = name.match(ANY_TAG);
  const cuts = [yearIndex, seIndex, tagMatch ? tagMatch.index : -1].filter(i => i > 0);
  const cutAt = cuts.length ? Math.min(...cuts) : name.length;

  const title = cleanTitle(name.slice(0, cutAt)) || cleanTitle(name);

  const pick = re => {
    const m = name.match(re);
    return m ? m[0].trim() : null;
  };

  return {
    title,
    year,
    kind: season !== null ? 'tv' : 'movie',
    season,
    episode,
    resolution: pick(TAGS.resolution),
    source:     pick(TAGS.source),
    videoCodec: pick(TAGS.videoCodec),
    audioCodec: pick(TAGS.audioCodec),
    bitDepth:   pick(TAGS.depth),
    hdr:        pick(TAGS.hdr),
    edition:    pick(TAGS.edition),
    dualAudio:  /\b(dual|multi)\s?audio\b/i.test(name),
    container,
    raw,
  };
}

/** Normalise a title for comparison: lowercase, no punctuation, no leading article. */
export function normaliseTitle(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/['\u2018\u2019`]/g, '')
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
