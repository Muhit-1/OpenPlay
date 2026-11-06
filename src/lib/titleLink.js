// src/lib/titleLink.js
//
// Where a title on the server leads. A real address, so the card can be a real
// link: left-click can do something richer, while Ctrl/Cmd/middle-click and
// "open in new tab" use this.

/**
 * @param {{url:string, type:string}} file   the folder or video on the server
 * @param {object|null} meta                 TMDB match, if any
 * @param {string|null} videoUrl             the one video inside, if there is exactly one
 * @returns {{ pathname: string, search: string, state?: object }}
 */
export function titleHref(file, meta, videoUrl) {
  // A matched title has an info page: poster, cast, trailer, episodes.
  if (meta?.id) {
    return { pathname: `/detail/${meta.id}`, search: `?type=${meta.type === 'tv' ? 'tv' : 'movie'}` };
  }
  // Unmatched but playable: straight to the player.
  if (videoUrl) {
    return {
      pathname: `/watch/${encodeURIComponent(videoUrl)}`,
      search: '',
      state: { file: { ...file, url: videoUrl }, meta },
    };
  }
  // A folder with nothing playable directly inside: browse it.
  return { pathname: '/browse', search: `?url=${encodeURIComponent(file.url)}` };
}
