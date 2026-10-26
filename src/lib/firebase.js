// src/lib/firebase.js
// Firebase connection + watch history + bookmarks helpers

import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from 'firebase/auth';
import { getItem, setItem } from './storage.js';

// `?? {}` lets the module load under Node (tests), where import.meta.env is absent.
const env = import.meta.env ?? {};

const firebaseConfig = {
  apiKey:     env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:  env.VITE_FIREBASE_PROJECT_ID,
};

// Sync across devices is optional — an unconfigured or invalid Firebase
// project must not crash the app for everyone else on load.
let db = null, auth = null;
try {
  if (firebaseConfig.apiKey && firebaseConfig.projectId) {
    const app = initializeApp(firebaseConfig);
    const nextAuth = getAuth(app);
    const nextDb   = getFirestore(app);
    // Assigned together so a half-working setup can't leak through.
    auth = nextAuth;
    db   = nextDb;
  }
} catch (err) {
  console.warn('[firebase] not configured, using this browser\'s storage instead:', err.message);
}

// ─── Local fallback ────────────────────────────────────────────────────────
// Without a Firebase project, history and the watchlist live in this browser's
// localStorage instead. Same function names and shapes, so callers don't care.

const LOCAL_CAP = 200;

function localRead(key) {
  try { return JSON.parse(getItem(key) || '[]'); } catch { return []; }
}

function localWrite(key, list) {
  setItem(key, JSON.stringify(list.slice(0, LOCAL_CAP)));
}

/** Newest-first list with `entry` moved (or added) to the top. */
function localUpsert(key, entry) {
  const rest = localRead(key).filter(e => e.fileUrl !== entry.fileUrl);
  localWrite(key, [entry, ...rest]);
}

// ─── Auth ──────────────────────────────────────────────────────────────────

export function ensureAuth() {
  if (!auth) return Promise.reject(new Error('Firebase not configured'));
  return new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(auth, user => {
      unsub();
      if (user) {
        resolve(user);
      } else {
        signInAnonymously(auth).then(cred => resolve(cred.user)).catch(reject);
      }
    });
  });
}

// ─── Watch History ─────────────────────────────────────────────────────────

/**
 * Save/update progress for a video.
 * @param {string} fileUrl  — direct video URL (used as ID)
 * @param {string} title
 * @param {string|null} poster
 * @param {number} progressSeconds
 * @param {number} durationSeconds
 */
export async function saveProgress(fileUrl, title, poster, progressSeconds, durationSeconds) {
  if (!db) {
    localUpsert('local_history', {
      fileUrl, title, poster: poster || null,
      progressSeconds: Math.floor(progressSeconds),
      durationSeconds: Math.floor(durationSeconds),
      watchedAt: Date.now(),
    });
    return;
  }
  const user = await ensureAuth();
  const id   = btoa(fileUrl).replace(/[/+=]/g, '_'); // safe Firestore doc ID
  await setDoc(
    doc(db, 'watch_history', `${user.uid}_${id}`),
    {
      userId: user.uid,
      fileUrl,
      title,
      poster: poster || null,
      progressSeconds: Math.floor(progressSeconds),
      durationSeconds: Math.floor(durationSeconds),
      watchedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Get progress for a specific video.
 * Returns progress in seconds, or 0 if not found.
 */
export async function getProgress(fileUrl) {
  if (!db) {
    return localRead('local_history').find(e => e.fileUrl === fileUrl)?.progressSeconds || 0;
  }
  const user = await ensureAuth();
  const id   = btoa(fileUrl).replace(/[/+=]/g, '_');
  const snap = await getDoc(doc(db, 'watch_history', `${user.uid}_${id}`));
  return snap.exists() ? snap.data().progressSeconds : 0;
}

/**
 * Get the last N watched items (for "Continue Watching" row).
 */
export async function getContinueWatching(n = 20) {
  if (!db) {
    return localRead('local_history').slice(0, n);
  }
  const user = await ensureAuth();
  const q = query(
    collection(db, 'watch_history'),
    where('userId', '==', user.uid),
    orderBy('watchedAt', 'desc'),
    limit(n)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data());
}

// ─── Bookmarks ─────────────────────────────────────────────────────────────

export async function addBookmark(fileUrl, title, poster) {
  if (!db) {
    localUpsert('local_bookmarks', { fileUrl, title, poster: poster || null, savedAt: Date.now() });
    return;
  }
  const user = await ensureAuth();
  const id   = btoa(fileUrl).replace(/[/+=]/g, '_');
  await setDoc(doc(db, 'bookmarks', `${user.uid}_${id}`), {
    userId: user.uid,
    fileUrl,
    title,
    poster: poster || null,
    savedAt: serverTimestamp(),
  });
}

export async function removeBookmark(fileUrl) {
  if (!db) {
    localWrite('local_bookmarks', localRead('local_bookmarks').filter(e => e.fileUrl !== fileUrl));
    return;
  }
  const user = await ensureAuth();
  const id   = btoa(fileUrl).replace(/[/+=]/g, '_');
  await deleteDoc(doc(db, 'bookmarks', `${user.uid}_${id}`));
}

export async function getBookmarks() {
  if (!db) {
    return localRead('local_bookmarks');
  }
  const user = await ensureAuth();
  const q = query(
    collection(db, 'bookmarks'),
    where('userId', '==', user.uid),
    orderBy('savedAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data());
}

export async function isBookmarked(fileUrl) {
  if (!db) {
    return localRead('local_bookmarks').some(e => e.fileUrl === fileUrl);
  }
  const user = await ensureAuth();
  const id   = btoa(fileUrl).replace(/[/+=]/g, '_');
  const snap = await getDoc(doc(db, 'bookmarks', `${user.uid}_${id}`));
  return snap.exists();
}

export const firebaseReady = Boolean(db && auth);

export { db, auth };