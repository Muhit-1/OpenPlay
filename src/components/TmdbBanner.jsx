// src/components/TmdbBanner.jsx
//
// Posters and ratings come from TMDB through the local API. When that is not
// working the cards just show folder icons, which looks like a bug in the app.
// This says what is actually wrong.

import { useEffect, useState } from 'react';
import { Notice } from './ui';

const MESSAGES = {
  'no-key': [
    'TMDB key is not set',
    'Add TMDB_API_KEY to the .env file next to server.js (free at themoviedb.org/settings/api), then restart OpenPlay.',
  ],
  'bad-key': [
    'TMDB rejected the API key',
    'Check TMDB_API_KEY in .env — use the "API Key", not the "Read Access Token" — then restart OpenPlay.',
  ],
  unreachable: [
    'Cannot reach TMDB from this computer',
    'Posters need api.themoviedb.org and image.tmdb.org. Some networks block them; try a VPN or different DNS.',
  ],
  'tmdb-error': [
    'TMDB is returning errors',
    'Try again in a few minutes.',
  ],
};

export default function TmdbBanner() {
  const [problem, setProblem] = useState(null);

  useEffect(() => {
    let live = true;
    fetch('/api/health', { signal: AbortSignal.timeout(10000) })
      .then(r => r.json())
      .then(h => { if (live && !h.ok) setProblem(h.reason); })
      .catch(() => {});   // no API at all is reported elsewhere
    return () => { live = false; };
  }, []);

  const message = problem && MESSAGES[problem];
  if (!message) return null;

  return (
    <div className="px-5 sm:px-7 pt-4">
      <Notice tone="warn" title={message[0]}>{message[1]}</Notice>
    </div>
  );
}
