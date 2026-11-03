// src/lib/drag.js
//
// Drag a title out of the page and drop it onto VLC (or any app that accepts a
// link). The drag carries the file's direct URL as both a link and plain text,
// which is what a desktop player reads when something is dropped onto it.
//
// Nothing is re-hosted: the URL is the one on the user's own server.

/** What a drag carries for a file URL. */
export function linkPayload(url) {
  const href = String(url ?? '').trim();
  return { 'text/uri-list': href, 'text/plain': href };
}

/** Shorten a long release name so the drag ghost stays readable. */
export function ghostLabel(label, max = 48) {
  const text = String(label ?? '').trim() || 'Video';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** dragstart handler: put the file link on the drag and show a labelled ghost. */
export function startLinkDrag(event, url, label) {
  const dt = event.dataTransfer;
  if (!dt || !url) return;

  // Children such as poster <img>s carry their own drag data; ours must win.
  dt.clearData();
  for (const [type, value] of Object.entries(linkPayload(url))) dt.setData(type, value);
  dt.effectAllowed = 'copyLink';

  if (typeof document !== 'undefined' && dt.setDragImage) {
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.textContent = ghostLabel(label);
    document.body.appendChild(ghost);
    dt.setDragImage(ghost, 14, 14);
    // The browser snapshots the element during this event; remove it right after.
    setTimeout(() => ghost.remove(), 0);
  }
}

/** Spread onto an element to make it a draggable link to `url`. */
export function dragLinkProps(url, label) {
  if (!url) return {};
  return {
    draggable: true,
    onDragStart: event => startLinkDrag(event, url, label),
  };
}
