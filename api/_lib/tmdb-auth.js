// api/_lib/tmdb-auth.js
//
// TMDB hands out two credentials: a short "API Key" (v3) and a long "API Read
// Access Token" (a JWT, starts with "eyJ"). People paste either into
// TMDB_API_KEY, so both are accepted.

export function tmdbAuth(credential) {
  const value = String(credential || '').trim();
  if (value.startsWith('eyJ')) {
    return { headers: { Authorization: `Bearer ${value}`, Accept: 'application/json' }, apiKey: null };
  }
  return { headers: { Accept: 'application/json' }, apiKey: value };
}
