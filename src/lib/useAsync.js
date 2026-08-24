// src/lib/useAsync.js

import { useState, useEffect } from 'react';

/**
 * Load an async resource identified by `key`.
 *
 * State is only ever set from inside the promise continuation, never
 * synchronously in the effect body, so switching keys does not trigger a
 * cascading re-render. Until the result for the current key arrives, the hook
 * reports `loading` and returns `initial` — so a stale result from the previous
 * key can never be shown as if it belonged to the new one.
 *
 * @param {string|number|null} key  identifies the request; null skips loading
 * @param {() => Promise<any>} loader
 * @param {any} initial  value returned while loading
 */
export function useAsync(key, loader, initial = null) {
  const [settled, setSettled] = useState({ key: undefined, data: initial, error: null });

  useEffect(() => {
    if (key === null || key === undefined) return;

    let live = true;
    Promise.resolve()
      .then(loader)
      .then(data => { if (live) setSettled({ key, data, error: null }); })
      .catch(error => { if (live) setSettled({ key, data: initial, error }); });

    return () => { live = false; };
    // `loader` is deliberately not a dependency: `key` identifies the request.
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const isCurrent = settled.key === key;

  return {
    data: isCurrent ? settled.data : initial,
    error: isCurrent ? settled.error : null,
    loading: key !== null && key !== undefined && !isCurrent,
  };
}
