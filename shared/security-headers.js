// shared/security-headers.js
//
// Headers sent with the app shell. `vercel.json` carries a static copy of the
// same values for the hosted build — keep the two in step (a test checks it).
//
// media-src and img-src allow plain http: on purpose: the ISP libraries
// OpenPlay plays from are ordinary http:// servers.

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://image.tmdb.org http:",
  'media-src * blob:',
  "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com",
  "frame-src 'self' openplay:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};
