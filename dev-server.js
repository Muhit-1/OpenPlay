// dev-server.js  (project root)
// A tiny Express wrapper so you can run the Vercel API functions locally
// without needing the Vercel CLI.
//
// Usage:  node dev-server.js
// Then in another terminal: npm run dev
//
// The Vite dev server proxies /api/* to this server on port 3001.

import express from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually (Vite handles this for the frontend; we do it here for the API)
try {
  const envContent = readFileSync(resolve(__dirname, '.env'), 'utf8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
} catch { /* .env not found — that's fine */ }

const app = express();
app.use(express.json());

// Helper: adapt Vercel-style handler to Express
function adaptHandler(handlerModule) {
  return async (req, res) => {
    // Vercel passes query params merged into req.query — Express already does this
    try {
      await handlerModule.default(req, res);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    }
  };
}

// Dynamically import the API modules
const proxyMod  = await import('./api/proxy.js');
const parseMod  = await import('./api/parse.js');
const tmdbMod   = await import('./api/tmdb.js');

app.all('/api/proxy', adaptHandler(proxyMod));
app.all('/api/parse', adaptHandler(parseMod));
app.all('/api/tmdb',  adaptHandler(tmdbMod));

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`\n OpenPlay API dev server running at http://localhost:${PORT}\n`);
});