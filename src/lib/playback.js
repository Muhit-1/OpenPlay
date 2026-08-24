// src/lib/playback.js
//
// Works out whether THIS browser can actually play a given file.
//
// The old behaviour guessed from the filename: any name containing "x265" or
// "10bit" got a red "Codec not supported — use VLC" banner. That is wrong on
// most modern machines — Chromium plays HEVC Main10 in Matroska perfectly well
// where the platform has a decoder — and it fired on nearly every 1080p file
// on the server, training users to ignore it.
//
// So nothing is asserted from the filename alone. The filename gives a fast
// provisional answer; a real load probe gives the verdict.

import { parseRelease } from './release.js';
import { basename } from './text.js';

// ── Codec strings for canPlayType ─────────────────────────────────────────

const CONTAINER_MIME = {
  mkv:  'video/x-matroska',
  webm: 'video/webm',
  mp4:  'video/mp4',
  m4v:  'video/mp4',
  mov:  'video/quicktime',
  avi:  'video/x-msvideo',
  ts:   'video/mp2t',
  m2ts: 'video/mp2t',
  ogv:  'video/ogg',
  m3u8: 'application/vnd.apple.mpegurl',
};

const VIDEO_CODEC_STRING = {
  x264: 'avc1.42E01E', h264: 'avc1.42E01E', 'h.264': 'avc1.42E01E', avc: 'avc1.42E01E',
  x265: 'hvc1.1.6.L93.B0', h265: 'hvc1.1.6.L93.B0', 'h.265': 'hvc1.1.6.L93.B0',
  hevc: 'hvc1.1.6.L93.B0',
  av1: 'av01.0.05M.08',
  vp9: 'vp09.00.10.08',
};

const AUDIO_CODEC_STRING = {
  aac: 'mp4a.40.2',
  'ac-3': 'ac-3', ac3: 'ac-3',
  'eac-3': 'ec-3', eac3: 'ec-3', 'e-ac-3': 'ec-3', 'dd+': 'ec-3', ddp: 'ec-3',
  opus: 'opus', flac: 'flac', mp3: 'mp4a.69',
};

// Codecs no browser implements. Naming them is more useful than a generic error.
const UNSUPPORTED_AUDIO = /^(dts|dts-hd|dts-x|truehd|atmos|pcm)$/i;

const key = s => String(s || '').toLowerCase().replace(/\s+/g, '');

/** Describe a file from its name — instant, provisional, never authoritative. */
export function describeMedia(nameOrUrl) {
  const name = basename(nameOrUrl);
  const r = parseRelease(name);

  return {
    container:  r.container,
    videoCodec: r.videoCodec,
    audioCodec: r.audioCodec,
    bitDepth:   r.bitDepth,
    resolution: r.resolution,
    hdr:        r.hdr,
    dualAudio:  r.dualAudio,
  };
}

/**
 * Ask the browser about a codec combination.
 * @returns {'probably'|'maybe'|'no'|'unknown'}
 */
export function canPlay({ container, videoCodec, audioCodec }) {
  if (typeof document === 'undefined') return 'unknown';

  const mime = CONTAINER_MIME[key(container)];
  if (!mime) return 'unknown';

  const video = document.createElement('video');

  const codecs = [
    VIDEO_CODEC_STRING[key(videoCodec)],
    AUDIO_CODEC_STRING[key(audioCodec)],
  ].filter(Boolean);

  const type = codecs.length ? `${mime}; codecs="${codecs.join(', ')}"` : mime;
  const answer = video.canPlayType(type);

  return answer === 'probably' ? 'probably' : answer === 'maybe' ? 'maybe' : 'no';
}

/**
 * Load the real file far enough to know whether it decodes.
 *
 * This is the authoritative check: it exercises the actual demuxer and decoder
 * against the actual bytes, so it catches the cases a MIME guess cannot.
 *
 * @returns {Promise<{playable: boolean, reason: string|null, width: number, height: number, duration: number}>}
 */
export function probeUrl(url, { timeoutMs = 12000 } = {}) {
  return new Promise(resolve => {
    if (typeof document === 'undefined') {
      return resolve({ playable: true, reason: null, width: 0, height: 0, duration: 0 });
    }

    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;

    let settled = false;
    const finish = (playable, reason) => {
      if (settled) return;
      settled = true;
      const result = {
        playable,
        reason,
        width: video.videoWidth,
        height: video.videoHeight,
        duration: Number.isFinite(video.duration) ? video.duration : 0,
      };
      clearTimeout(timer);
      video.removeAttribute('src');
      video.load();
      resolve(result);
    };

    const timer = setTimeout(() => finish(false, 'timeout'), timeoutMs);

    video.addEventListener('loadedmetadata', () => {
      // Metadata parsed and a video track has real dimensions: it decodes.
      if (video.videoWidth > 0) finish(true, null);
      else finish(false, 'no-video-track');
    }, { once: true });

    video.addEventListener('error', () => {
      const code = video.error?.code;
      finish(false, code === 4 ? 'unsupported' : code === 2 ? 'network' : 'decode-error');
    }, { once: true });

    video.src = url;
    video.load();
  });
}

/**
 * Everything the UI needs to describe a file honestly.
 *
 * `status` is one of:
 *   'checking'  — probe still running
 *   'ok'        — plays in this browser
 *   'no-audio'  — video plays, but the audio track is a codec browsers lack
 *   'blocked'   — will not play here; offer VLC or download
 */
export async function inspectPlayback(url, { probe = true } = {}) {
  const media = describeMedia(url);

  const audioUnsupported =
    !!media.audioCodec && UNSUPPORTED_AUDIO.test(key(media.audioCodec).replace(/\d.*$/, ''));

  if (!probe) {
    const guess = canPlay(media);
    return {
      ...media,
      status: guess === 'no' ? 'blocked' : audioUnsupported ? 'no-audio' : 'ok',
      probed: false,
      reason: null,
    };
  }

  const result = await probeUrl(url);

  return {
    ...media,
    status: !result.playable ? 'blocked' : audioUnsupported ? 'no-audio' : 'ok',
    probed: true,
    reason: result.reason,
    width: result.width,
    height: result.height,
    duration: result.duration,
  };
}

/** Short technical summary for the availability chip, e.g. "MKV · HEVC · 10-bit". */
export function mediaSummary(media) {
  return [
    media.resolution?.toUpperCase(),
    media.container?.toUpperCase(),
    media.videoCodec ? normaliseCodecLabel(media.videoCodec) : null,
    media.bitDepth?.replace(/-?bit/i, '-bit'),
    media.hdr?.toUpperCase(),
  ].filter(Boolean).join(' · ');
}

function normaliseCodecLabel(codec) {
  const k = key(codec);
  if (['x265', 'h265', 'h.265', 'hevc'].includes(k)) return 'HEVC';
  if (['x264', 'h264', 'h.264', 'avc'].includes(k)) return 'H.264';
  return codec.toUpperCase();
}
