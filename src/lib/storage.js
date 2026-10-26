// src/lib/storage.js
//
// localStorage that cannot throw. Private windows, blocked site data and a full
// quota all make the real thing raise; preferences are never worth a crash.

export function getItem(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function setItem(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}

export function removeItem(key) {
  try { localStorage.removeItem(key); } catch { /* nothing to remove */ }
}
