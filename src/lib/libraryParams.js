// src/lib/libraryParams.js
//
// The Library page keeps its whole view in the address bar: library, section,
// search text, filters, sort, page and the open item. That is what makes Back,
// reload and "copy link" land on the same view, and lets a title be opened in a
// new tab without losing the list behind it.
//
//   lib, s       library and section (year / letters)
//   q            title search text
//   sort         server | az | newest | top | popular
//   qual         resolutions, comma separated ("1080p,4K")
//   g, r, y, l   genre, minimum rating, decade, language
//   p            page number
//   item         url of the title whose side panel is open

export const SORT_KEYS = ['server', 'az', 'newest', 'top', 'popular'];

/** Keys that describe the list itself, so changing one starts again at page 1. */
const NOT_PAGE_RESETTING = new Set(['p', 'item']);

const isEmpty = (key, value) =>
  value == null || value === '' || value === false ||
  (key === 'sort' && value === 'server') ||
  (key === 'y' && value === 'all') ||
  (key === 'r' && Number(value) === 0) ||
  (key === 'p' && Number(value) <= 1);

/** The view encoded in a URLSearchParams, with safe defaults for anything odd. */
export function readView(params) {
  const sort = params.get('sort');
  const rating = Number(params.get('r'));
  const page = Math.floor(Number(params.get('p')));

  return {
    filter: params.get('q') || '',
    sort: SORT_KEYS.includes(sort) ? sort : 'server',
    quals: new Set((params.get('qual') || '').split(',').map(s => s.trim()).filter(Boolean)),
    genre: params.get('g') || null,
    minRating: Number.isFinite(rating) && rating > 0 ? rating : 0,
    year: params.get('y') || 'all',
    language: params.get('l') || null,
    page: Number.isFinite(page) && page > 1 ? page : 1,
    item: params.get('item') || null,
  };
}

/**
 * A copy of `params` with `patch` applied. Empty and default values are removed
 * so addresses stay short, and any change to the list itself drops the page.
 * Sets and arrays (qual) are written as sorted comma lists.
 */
export function patchParams(params, patch) {
  const next = new URLSearchParams(params);
  let listChanged = false;

  for (const [key, raw] of Object.entries(patch)) {
    const value = raw instanceof Set || Array.isArray(raw) ? [...raw].sort().join(',') : raw;
    if (!NOT_PAGE_RESETTING.has(key)) listChanged = true;

    if (isEmpty(key, value)) next.delete(key);
    else next.set(key, String(value));
  }

  if (listChanged && !('p' in patch)) next.delete('p');
  return next;
}

/** Storage key for the scroll position of a list view: the address minus the open item. */
export function scrollKey(pathname, params) {
  const rest = new URLSearchParams(params);
  rest.delete('item');
  rest.sort();
  return `scroll:${pathname}?${rest}`;
}
