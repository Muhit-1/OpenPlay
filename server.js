// server.js
//
// One small Express server for OpenPlay.
//
//   node server.js           API only, for `npm run dev:all` (Vite serves the UI)
//   node server.js --prod    API + the built UI from ./dist, for a LAN install
//
// This is the intended way to run OpenPlay: on a machine that can reach your
// ISP's servers. The same API handlers also run as Vercel functions, but a
// cloud deployment cannot reach private LAN addresses (see README).

import express from 'express';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

import { SECURITY_HEADERS } from './shared/security-headers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Load .env by hand; Vite does this for the frontend, nothing does it for the API. */
export function loadEnv(file = resolve(__dirname, '.env')) {
  let content;
  try { content = readFileSync(file, 'utf8'); } catch { return; }

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

/** Adapt a Vercel-style (req, res) handler to Express, with a safety net. */
function adapt(mod) {
  return async (req, res) => {
    try {
      await mod.default(req, res);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    }
  };
}

export async function createApp({ serveUi = false } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');

  const [proxy, parse, tmdb] = await Promise.all([
    import('./api/proxy.js'),
    import('./api/parse.js'),
    import('./api/tmdb.js'),
  ]);

  app.all('/api/proxy', adapt(proxy));
  app.all('/api/parse', adapt(parse));
  app.all('/api/tmdb',  adapt(tmdb));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  if (serveUi) {
    const dist = resolve(__dirname, 'dist');
    if (!existsSync(resolve(dist, 'index.html'))) {
      throw new Error('dist/ is missing — run `npm run build` first.');
    }

    app.use((req, res, next) => {
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
      next();
    });
    // Hashed assets are immutable; index.html must always be revalidated.
    app.use('/assets', express.static(resolve(dist, 'assets'), { immutable: true, maxAge: '1y' }));
    app.use(express.static(dist, { maxAge: '1h', index: false }));
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(resolve(dist, 'index.html'));
    });
  }

  return app;
}

// Run only when executed directly, so tests can import createApp.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  loadEnv();
  const prod = process.argv.includes('--prod');
  const port = Number(process.env.PORT) || (prod ? 8080 : 3001);
  // Dev stays on loopback; a LAN install must be reachable by other devices.
  const host = process.env.HOST || (prod ? '0.0.0.0' : '127.0.0.1');

  const app = await createApp({ serveUi: prod });
  app.listen(port, host, () => {
    // 0.0.0.0 means "all interfaces" — it is not an address a browser can open.
    const shown = host === '0.0.0.0' || host === '::' ? 'localhost' : host;
    console.log(`\n OpenPlay ${prod ? 'server' : 'API'} is running.`);
    console.log(` Open  http://${shown}:${port}`);
    if (host === '0.0.0.0') console.log(' Other devices on your network can use this machine\'s LAN address with the same port.');
    console.log();
  });
}
