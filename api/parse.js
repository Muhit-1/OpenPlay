// api/parse.js — Vercel Serverless Function
// Parses an open-directory HTML listing (Apache / Nginx / lighttpd style)
// Returns a JSON tree of folders and files found at the given URL.

const VIDEO_EXT = new Set([
  'mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'ts', 'mpg', 'mpeg',
]);
const SUB_EXT = new Set(['srt', 'vtt', 'ass', 'ssa', 'sub']);

function parseDirectoryHTML(html, baseUrl) {
  const folders = [];
  const files = [];

  // Match <a href="..."> links — covers Apache, Nginx, and lighttpd listings
  const linkRegex = /<a\s[^>]*href="([^"#?]+)"[^>]*>([^<]*)<\/a>/gi;
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    let href = match[1].trim();
    const label = match[2].trim();

    // Skip parent directory links and absolute external links
    if (
      href === '../' ||
      href === '/' ||
      href.startsWith('?') ||
      href.startsWith('//') ||
      (href.startsWith('http') && !href.startsWith(baseUrl))
    ) {
      continue;
    }

let absoluteUrl;
if (href.startsWith('http')) {
  absoluteUrl = href;
} else if (href.startsWith('/')) {
  // Absolute path — attach just the origin (http://172.16.50.12)
  const origin = new URL(baseUrl).origin;
  absoluteUrl = origin + href;
} else {
  // Relative path — attach to base as-is
  absoluteUrl = baseUrl.replace(/\/$/, '') + '/' + href;
}

    if (href.endsWith('/')) {
      // It's a folder
      const name = decodeURIComponent(href.replace(/\/$/, '').split('/').pop());
      folders.push({ type: 'folder', name, url: absoluteUrl });
    } else {
      // It's a file — check extension
      const ext = href.split('.').pop().toLowerCase();
      const name = decodeURIComponent(href.split('/').pop());

      if (VIDEO_EXT.has(ext)) {
        files.push({ type: 'video', name, url: absoluteUrl, ext });
      } else if (SUB_EXT.has(ext)) {
        files.push({ type: 'subtitle', name, url: absoluteUrl, ext });
      }
      // Silently ignore other file types (images, nfos, etc.)
    }
  }

  return { folders, files };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
   
   const proto = req.headers['x-forwarded-proto'] || 'http';
const proxyUrl = `${proto}://${req.headers.host}/api/proxy?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxyUrl, {
      signal: AbortSignal.timeout(12000),
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch directory' });
    }

    const html = await response.text();
    const result = parseDirectoryHTML(html, url);

    return res.status(200).json(result);
  } catch (err) {
    console.error('[parse] error:', err.message);
    return res.status(502).json({ error: 'Parse failed', detail: err.message });
  }
}