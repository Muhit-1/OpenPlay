// src/components/VlcButton.jsx
//
// Hands the current stream to VLC.
//
// VLC is the answer to three separate limitations that browsers genuinely
// cannot solve: containers and codecs Chromium will not decode, alternate
// audio tracks (Chrome does not implement `HTMLMediaElement.audioTracks`, so a
// dual-audio file is stuck on whichever track is marked default), and subtitles
// muxed into the file rather than sitting beside it.
//
// If the scheme has not been registered yet, the button says so and offers the
// playlist fallback instead of silently doing nothing.

import { useState } from 'react';
import { MonitorPlay, Loader2, Download, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { openInVlc, downloadPlaylist, markVlcReady, isVlcReady } from '../lib/vlc';

export default function VlcButton({ url, title, prominent = false }) {
  const [state, setState] = useState('idle');   // idle | trying | needs-setup

  const play = async () => {
    setState('trying');
    const launched = await openInVlc(url);

    if (launched) {
      markVlcReady();
      setState('idle');
      return;
    }

    // Nothing took focus. Either the scheme is not registered, or the user was
    // already looking elsewhere — offer the fallback either way.
    setState(isVlcReady() ? 'idle' : 'needs-setup');
  };

  const size = prominent ? 'px-5 h-11 text-[15px]' : 'px-3.5 h-9 text-[14px]';

  return (
    <div className="flex flex-col gap-2 items-start">
      <button
        onClick={play}
        disabled={state === 'trying'}
        className={`${prominent ? 'btn-accent' : 'control'} flex items-center gap-2 rounded-[10px] ${size}`}
        style={prominent ? undefined : { color: 'var(--text-soft)' }}
      >
        {state === 'trying'
          ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          : <MonitorPlay size={16} aria-hidden="true" />}
        Play in VLC
      </button>

      {state === 'needs-setup' && (
        <div
          className="rounded-xl px-3.5 py-3 text-[14px] max-w-sm"
          style={{
            background: 'var(--ink-850)',
            border: '1px solid var(--line-bright)',
            color: 'var(--text-soft)',
          }}
        >
          <p className="mb-2.5">
            VLC did not open. One-time setup registers the handoff so this button works
            instantly from now on.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/settings"
              className="control flex items-center gap-1.5 px-3 h-9 text-[13px]"
              style={{ color: 'var(--text)' }}
            >
              <Settings size={14} aria-hidden="true" />
              Set up
            </Link>
            <button
              onClick={() => { downloadPlaylist(url, title); setState('idle'); }}
              className="control flex items-center gap-1.5 px-3 h-9 text-[13px]"
              style={{ color: 'var(--text-soft)' }}
            >
              <Download size={14} aria-hidden="true" />
              Download playlist
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
