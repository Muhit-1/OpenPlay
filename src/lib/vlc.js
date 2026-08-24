// src/lib/vlc.js
//
// Handing a stream off to VLC.
//
// A web page cannot launch a desktop program directly — no browser API allows
// it, and none should. The only sanctioned route is navigating to a registered
// URL scheme, and VLC does not register one on Windows (verified: no `vlc://`
// handler exists after a stock VLC 3.0.23 install).
//
// So OpenPlay registers its own `openplay://` scheme, via a .reg file the user
// runs once. Two details matter:
//
//   * The address is base64url-encoded into the link. Windows mangles a raw
//     `openplay://http://host/path%20with%20escapes` before the handler sees
//     it; an opaque token survives intact.
//   * The handler uses `-band 3` rather than `% 4`, because ShellExecute
//     substitutes %1–%9 inside registry command strings and would eat the `%4`.
//
// Without the scheme registered there is still the .m3u route, which needs no
// setup but requires the user to open the downloaded file.

const SCHEME = 'openplay';
const DEFAULT_VLC_PATH = 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe';

/** base64url, so the address survives the trip through the shell untouched. */
function encodeTarget(url) {
  const bytes = new TextEncoder().encode(url);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function vlcProtocolUrl(mediaUrl) {
  return `${SCHEME}://${encodeTarget(mediaUrl)}/`;
}

/**
 * Ask the OS to open the stream in VLC through the registered scheme.
 *
 * Resolves true if another application appears to have taken focus. There is
 * no way to detect an unregistered scheme directly — the browser silently does
 * nothing — so window blur is used as the signal, and the caller should offer
 * the setup instructions when this returns false.
 */
export function openInVlc(mediaUrl) {
  return new Promise(resolve => {
    let launched = false;
    const onBlur = () => { launched = true; };

    window.addEventListener('blur', onBlur, { once: true });

    // An iframe navigation avoids the "leave site?" interstitial some browsers
    // show for an unknown top-level scheme.
    const frame = document.createElement('iframe');
    frame.style.display = 'none';
    frame.src = vlcProtocolUrl(mediaUrl);
    document.body.appendChild(frame);

    setTimeout(() => {
      window.removeEventListener('blur', onBlur);
      frame.remove();
      resolve(launched);
    }, 1500);
  });
}

// ── Playlist fallback ─────────────────────────────────────────────────────

export function buildPlaylist(mediaUrl, title = '') {
  return ['#EXTM3U', `#EXTINF:-1,${title || 'OpenPlay stream'}`, mediaUrl, ''].join('\n');
}

/** Download an .m3u the user can open in their media player. */
export function downloadPlaylist(mediaUrl, title = '') {
  saveBlob(
    new Blob([buildPlaylist(mediaUrl, title)], { type: 'audio/x-mpegurl' }),
    `${safeFilename(title) || 'openplay'}.m3u`
  );
}

// ── One-time scheme registration ──────────────────────────────────────────

/**
 * A Windows .reg file registering `openplay://` for the current user.
 *
 * Written to HKEY_CURRENT_USER so it needs no administrator rights and can be
 * undone with:  reg delete HKCU\Software\Classes\openplay /f
 */
export function buildVlcRegistryFile(vlcPath = DEFAULT_VLC_PATH) {
  const command = [
    'powershell -NoProfile -WindowStyle Hidden -Command',
    `"$a='%1' -replace '^${SCHEME}:/*','' -replace '/+$','';`,
    "$b=$a.Replace('-','+').Replace('_','/');",
    "while($b.Length -band 3){$b+='='};",
    '$u=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b));',
    `Start-Process -FilePath '${vlcPath}' -ArgumentList @($u)"`,
  ].join(' ');

  // Registry string values escape backslashes and quotes.
  const escaped = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  return [
    'Windows Registry Editor Version 5.00',
    '',
    // Kept pure ASCII: regedit is fussy about encoding in .reg files.
    '; Registers the openplay:// scheme so OpenPlay can hand a stream to VLC.',
    '; User-scope only - no administrator rights needed.',
    `; To undo:  reg delete HKCU\\Software\\Classes\\${SCHEME} /f`,
    '',
    `[HKEY_CURRENT_USER\\Software\\Classes\\${SCHEME}]`,
    '@="URL:OpenPlay VLC handoff"',
    '"URL Protocol"=""',
    '',
    `[HKEY_CURRENT_USER\\Software\\Classes\\${SCHEME}\\shell\\open\\command]`,
    `@="${escaped}"`,
    '',
  ].join('\r\n');
}

export function downloadVlcRegistryFile(vlcPath) {
  saveBlob(
    new Blob([buildVlcRegistryFile(vlcPath)], { type: 'application/octet-stream' }),
    'openplay-vlc-setup.reg'
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function saveBlob(blob, filename) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

function safeFilename(name) {
  // eslint-disable-next-line no-control-regex
  return String(name).replace(/[<>:"/\\|?*\u0000-\u001F]/g, '').trim().slice(0, 80);
}

/** Remembered after a successful handoff, to stop nagging about setup. */
export function markVlcReady() {
  localStorage.setItem('vlc_ready', '1');
}

export function isVlcReady() {
  return localStorage.getItem('vlc_ready') === '1';
}
