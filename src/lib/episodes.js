// src/lib/episodes.js
//
// Every episode of the show a file belongs to, found from where the file sits.
//
// Servers lay series out as  Show/Season 1/ep.mkv  or flat  Show/ep.mkv. Listing
// only the file's own folder shows one season; the others are sibling folders,
// so those are read too and tagged with the season their folder names.

import { fetchDirectory } from './tmdb.js';
import { parseRelease } from './release.js';
import { safeDecode } from './text.js';

const SEASON_FOLDER = /^(?:season|series|saison|s)[\s._-]*(\d{1,2})\b/i;

/** "Season 02" -> 2, "S3" -> 3, "Extras" -> null. */
export function seasonFromFolderName(name) {
  const m = String(name || '').trim().match(SEASON_FOLDER);
  return m ? parseInt(m[1], 10) : null;
}

/** Parent directory of a URL, always ending in a slash. */
export function parentUrl(url) {
  const trimmed = String(url).replace(/[?#].*$/, '').replace(/\/+$/, '');
  return trimmed.slice(0, trimmed.lastIndexOf('/') + 1);
}

function lastSegment(url) {
  return safeDecode(String(url).replace(/\/+$/, '').split('/').pop());
}

/**
 * Order episodes the way a person would watch them: season, then episode,
 * then name. Files that name no season sort with season 0.
 */
export function orderEpisodes(files) {
  return files
    .map(file => {
      const parsed = parseRelease(file.name);
      return {
        ...file,
        season: parsed.season ?? file.seasonHint ?? null,
        episode: parsed.episode,
      };
    })
    .sort((a, b) =>
      (a.season ?? 0) - (b.season ?? 0) ||
      (a.episode ?? 0) - (b.episode ?? 0) ||
      a.name.localeCompare(b.name, undefined, { numeric: true })
    );
}

/** Same file, whether or not either URL has its %20s decoded. */
export function sameUrl(a, b) {
  return safeDecode(a) === safeDecode(b);
}

/** The episode after `currentUrl`, or null at the end. */
export function nextEpisode(ordered, currentUrl) {
  const i = ordered.findIndex(f => sameUrl(f.url, currentUrl));
  return i >= 0 && i < ordered.length - 1 ? ordered[i + 1] : null;
}

/**
 * Videos and subtitles beside a file, plus every other season folder.
 * @returns {Promise<{ videos: Array, subtitles: Array }>}
 */
export async function loadEpisodes(fileUrl) {
  const parent = parentUrl(fileUrl);
  const here = await fetchDirectory(parent);

  const videos = (here.files || [])
    .filter(f => f.type === 'video')
    .map(f => ({ ...f, seasonHint: seasonFromFolderName(lastSegment(parent)) }));
  const subtitles = (here.files || []).filter(f => f.type === 'subtitle');

  // Other seasons: siblings of this folder when it is a season folder, or
  // children of this folder when the files sit at the show's root.
  const seasonFolders = [];
  if (seasonFromFolderName(lastSegment(parent)) !== null) {
    const up = await fetchDirectory(parentUrl(parent));
    for (const f of up.folders || []) {
      if (!sameUrl(f.url, parent) && seasonFromFolderName(f.name) !== null) seasonFolders.push(f);
    }
  }
  for (const f of here.folders || []) {
    if (seasonFromFolderName(f.name) !== null) seasonFolders.push(f);
  }

  const others = await Promise.all(
    seasonFolders.slice(0, 30).map(async folder => {
      try {
        const data = await fetchDirectory(folder.url);
        const hint = seasonFromFolderName(folder.name);
        return (data.files || []).filter(f => f.type === 'video').map(f => ({ ...f, seasonHint: hint }));
      } catch { return []; }
    })
  );

  // A file must appear once however its URL happens to be spelled.
  const seen = new Set();
  const unique = [...videos, ...others.flat()].filter(v => {
    const key = safeDecode(v.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { videos: unique, subtitles };
}

/**
 * Every episode of a show, read from the show's own folder: videos at its
 * root plus the videos inside each subfolder (season folders, or any grouping).
 * @returns {Promise<Array>}
 */
export async function loadShowEpisodes(showUrl) {
  const root = await fetchDirectory(showUrl);
  const tag = (files, hint) =>
    (files || []).filter(f => f.type === 'video').map(f => ({ ...f, seasonHint: hint }));

  const groups = await Promise.all(
    (root.folders || []).slice(0, 40).map(async folder => {
      try {
        const data = await fetchDirectory(folder.url);
        return tag(data.files, seasonFromFolderName(folder.name));
      } catch { return []; }
    })
  );

  const seen = new Set();
  return [...tag(root.files, null), ...groups.flat()].filter(v => {
    const key = safeDecode(v.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
