// api/proxy.js — Vercel Serverless Function
// Fetches an ISP open directory, bypasses CORS

export default async function handler(req, res) {
  // Allow CORS from your own frontend
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

  // Basic sanity check — must be http/https
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return res.status(400).json({ error: 'url must start with http:// or https://' });
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; OpenPlay/1.0)',
        'Accept': 'text/html,application/xhtml+xml,*/*',
      },
      // 10-second timeout
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Remote server returned ${response.status}`,
      });
    }

    const contentType = response.headers.get('content-type') || 'text/html';
    const text = await response.text();

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(text);
  } catch (err) {
    console.error('[proxy] fetch error:', err.message);
    return res.status(502).json({ error: 'Failed to reach remote server', detail: err.message });
  }
}