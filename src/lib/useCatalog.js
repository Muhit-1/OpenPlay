// src/lib/useCatalog.js
//
// A library's catalogue index as React state: the records so far, and how far
// the background job has got. Starting the job is part of using it.

import { useEffect, useState, useSyncExternalStore } from 'react';
import { getStore } from './catalog-store.js';
import { catalogVersion, ensureIndexed, indexState, subscribeCatalog } from './catalog.js';
import { queryCatalog, MIN_VOTES_FOR_TOP } from './catalog-query.js';

const RELOAD_EVERY = 25;   // matches the indexer's write batch

export function useCatalog(library) {
  // Re-render whenever any job reports progress.
  useSyncExternalStore(subscribeCatalog, catalogVersion);

  const key = library?.key;
  const state = key ? indexState(key) : indexState('');
  const [records, setRecords] = useState([]);

  useEffect(() => {
    if (library) ensureIndexed(library, {}, { priority: true });
  }, [library]);

  // Re-read the store as batches land, and once more when the job ends.
  const bucket = state.running ? Math.floor(state.done / RELOAD_EVERY) : `end-${state.finishedAt}`;
  useEffect(() => {
    if (!key) return;
    let live = true;
    getStore().getLibrary(key).then(rows => { if (live) setRecords(rows); }).catch(() => {});
    return () => { live = false; };
  }, [key, bucket]);

  return { records: key ? records.filter(r => r.library === key) : [], state };
}

/**
 * The best-rated titles across several libraries, from whatever is indexed so
 * far. Starts (low priority) indexing for any library that has not been read.
 */
export function useTopRated(libraries, limit = 24) {
  useSyncExternalStore(subscribeCatalog, catalogVersion);

  const keys = libraries.map(l => l.key).join('|');
  const [records, setRecords] = useState([]);

  useEffect(() => {
    libraries.forEach(l => ensureIndexed(l));
    // libraries is memoised by the caller; its keys are what identify it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]);

  const progress = libraries
    .map(l => { const s = indexState(l.key); return s.running ? Math.floor(s.done / RELOAD_EVERY) : `e${s.finishedAt}`; })
    .join(',');

  useEffect(() => {
    let live = true;
    Promise.all(libraries.map(l => getStore().getLibrary(l.key)))
      .then(rows => { if (live) setRecords(rows.flat()); })
      .catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, progress]);

  return queryCatalog(records, { minRating: 7, sort: 'top' })
    .filter(r => (r.votes ?? 0) >= MIN_VOTES_FOR_TOP)
    .slice(0, limit)
    .map(r => ({ name: r.name, url: r.url, type: r.fileType }));
}
