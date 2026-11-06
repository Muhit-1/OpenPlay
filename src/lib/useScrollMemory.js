// src/lib/useScrollMemory.js
//
// Coming Back to a long list should put you where you were. The browser cannot:
// the grid is built after the page loads, so there is nothing tall enough to
// scroll to yet. This remembers the position per view and restores it once the
// grid has rendered — only on Back/Forward, never on a fresh visit.

import { useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigationType } from 'react-router-dom';

const RESTORE_WINDOW_MS = 1200;   // how long to keep trying while the page grows
const INTERRUPTS = ['wheel', 'touchstart', 'keydown', 'mousedown'];

export function useScrollMemory(key, ready) {
  const navType = useNavigationType();
  const armed = useRef(false);        // saving starts only once the restore is over
  const restoredFor = useRef(null);

  // The browser's own restoration races the grid and would overwrite ours.
  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => { window.history.scrollRestoration = previous; };
  }, []);

  useLayoutEffect(() => {
    if (!ready || restoredFor.current === key) return;
    restoredFor.current = key;

    let saved = 0;
    if (navType === 'POP') {
      try { saved = Number(sessionStorage.getItem(key)) || 0; } catch { /* private window */ }
    }
    if (saved <= 0) { armed.current = true; return; }

    // The page is often shorter than the saved position for a frame or two (the
    // grid is still laying out), and the browser clamps a scroll past the end.
    // So keep aiming at the saved position until it sticks — and give up the
    // moment the person scrolls or presses a key themselves.
    armed.current = false;
    let frame = 0;
    let stopped = false;
    const started = performance.now();

    const finish = () => {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(frame);
      INTERRUPTS.forEach(type => window.removeEventListener(type, finish));
      armed.current = true;
    };
    INTERRUPTS.forEach(type => window.addEventListener(type, finish, { passive: true, once: true }));

    const attempt = () => {
      if (stopped) return;
      window.scrollTo(0, saved);
      if (Math.abs(window.scrollY - saved) <= 2 || performance.now() - started > RESTORE_WINDOW_MS) {
        finish();
        return;
      }
      frame = requestAnimationFrame(attempt);
    };
    attempt();

    return finish;
  }, [key, ready, navType]);

  useEffect(() => {
    let frame = 0;
    const saveNow = () => {
      if (!armed.current) return;
      try { sessionStorage.setItem(key, String(Math.round(window.scrollY))); } catch { /* ignore */ }
    };
    const save = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(saveNow);
    };

    window.addEventListener('scroll', save, { passive: true });
    // Also record it at the click that leaves — before any navigation starts and
    // the next page's height gets involved.
    document.addEventListener('click', saveNow, true);
    return () => {
      window.removeEventListener('scroll', save);
      document.removeEventListener('click', saveNow, true);
      cancelAnimationFrame(frame);
    };
  }, [key]);
}
