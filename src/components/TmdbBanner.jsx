// src/components/TmdbBanner.jsx
//
// Posters and ratings come from TMDB through the local API. When that is not
// working the cards just show folder icons, which looks like a bug in the app.
// This says what is actually wrong.

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Notice } from './ui';
import { pingApi, usesHelper, apiBase } from '../lib/api';

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
  const [problem, setProblem] = useState(null);   // a TMDB reason, or 'no-helper'
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    const { reachable, health } = await pingApi();
    setChecking(false);

    if (!reachable) setProblem(usesHelper() ? 'no-helper' : 'no-api');
    else setProblem(health.ok ? null : health.reason);
  }, []);

  useEffect(() => {
    // Deferred so the state updates inside check() are not synchronous in the effect.
    const t = setTimeout(check, 0);
    return () => clearTimeout(t);
  }, [check]);

  if (problem === 'no-helper') {
    return (
      <div className="px-5 sm:px-7 pt-4">
        <Notice
          tone="warn"
          title="The OpenPlay helper is not running"
          action={
            <button onClick={check} disabled={checking} className="control px-3.5 h-9 text-sm flex-shrink-0">
              {checking ? 'Checking' : 'Try again'}
            </button>
          }
        >
          This page needs a small helper on your own computer, because only it can reach your ISP
          server. In the OpenPlay folder run <span className="mono">npm run helper</span> and leave it
          open (looking for it at <span className="mono">{apiBase()}</span>). If your browser asks to
          allow access to devices on your network, choose Allow.{' '}
          <Link to="/settings" className="underline">Helper settings</Link>
        </Notice>
      </div>
    );
  }

  if (problem === 'no-api') {
    return (
      <div className="px-5 sm:px-7 pt-4">
        <Notice
          tone="error"
          title="OpenPlay's API is not running"
          action={
            <button onClick={check} disabled={checking} className="control px-3.5 h-9 text-sm flex-shrink-0">
              {checking ? 'Checking' : 'Try again'}
            </button>
          }
        >
          Libraries, posters and playback all need it. In the OpenPlay folder run{' '}
          <span className="mono">npm run dev:all</span> (development) or{' '}
          <span className="mono">npm start</span> (after <span className="mono">npm run build</span>),
          then reload this page.
        </Notice>
      </div>
    );
  }

  const message = problem && MESSAGES[problem];
  if (!message) return null;

  return (
    <div className="px-5 sm:px-7 pt-4">
      <Notice tone="warn" title={message[0]}>{message[1]}</Notice>
    </div>
  );
}
