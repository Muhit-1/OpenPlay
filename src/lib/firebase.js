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

const firebaseConfig = {
  apiKey:     import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:  import.meta.env.VITE_FIREBASE_PROJECT_ID,
};

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

// ─── Auth ──────────────────────────────────────────────────────────────────

export function ensureAuth() {
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
  const user = await ensureAuth();
  const id   = btoa(fileUrl).replace(/[/+=]/g, '_');
  const snap = await getDoc(doc(db, 'watch_history', `${user.uid}_${id}`));
  return snap.exists() ? snap.data().progressSeconds : 0;
}

/**
 * Get the last N watched items (for "Continue Watching" row).
 */
export async function getContinueWatching(n = 20) {
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
  const user = await ensureAuth();
  const id   = btoa(fileUrl).replace(/[/+=]/g, '_');
  await deleteDoc(doc(db, 'bookmarks', `${user.uid}_${id}`));
}

export async function getBookmarks() {
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
  const user = await ensureAuth();
  const id   = btoa(fileUrl).replace(/[/+=]/g, '_');
  const snap = await getDoc(doc(db, 'bookmarks', `${user.uid}_${id}`));
  return snap.exists();
}

export { db, auth };