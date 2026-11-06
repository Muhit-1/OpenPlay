// src/lib/catalog-store.js
//
// Where the catalogue index is kept: IndexedDB in the browser (thousands of
// records, far past what localStorage handles), or memory when IndexedDB is not
// available (private windows, tests). Same small interface either way.
//
//   getLibrary(key)  -> records
//   putMany(records)
//   deleteMany(urls)
//   clear(key?)      one library, or everything

const DB_NAME = 'openplay-catalog';
const STORE   = 'titles';

export function createMemoryStore() {
  const rows = new Map();
  return {
    kind: 'memory',
    async getLibrary(key) { return [...rows.values()].filter(r => r.library === key); },
    async putMany(records) { for (const r of records) rows.set(r.url, r); },
    async deleteMany(urls) { for (const u of urls) rows.delete(u); },
    async clear(key) {
      for (const [url, r] of [...rows]) if (!key || r.library === key) rows.delete(url);
    },
  };
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror   = () => reject(request.error);
  });
}

export function createIdbStore(idb = globalThis.indexedDB) {
  let opened = null;

  const open = () => (opened ||= new Promise((resolve, reject) => {
    const req = idb.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'url' });
      store.createIndex('library', 'library');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  }));

  const tx = async mode => (await open()).transaction(STORE, mode);
  const done = t => new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = t.onabort = () => reject(t.error);
  });

  return {
    kind: 'indexeddb',
    async getLibrary(key) {
      const t = await tx('readonly');
      return wrap(t.objectStore(STORE).index('library').getAll(key));
    },
    async putMany(records) {
      const t = await tx('readwrite');
      for (const r of records) t.objectStore(STORE).put(r);
      return done(t);
    },
    async deleteMany(urls) {
      const t = await tx('readwrite');
      for (const u of urls) t.objectStore(STORE).delete(u);
      return done(t);
    },
    async clear(key) {
      const t = await tx('readwrite');
      const store = t.objectStore(STORE);
      if (!key) store.clear();
      else {
        const req = store.index('library').getAllKeys(key);
        req.onsuccess = () => req.result.forEach(k => store.delete(k));
      }
      return done(t);
    },
  };
}

let shared = null;

/** The store the app uses: IndexedDB when present, memory otherwise. */
export function getStore() {
  if (shared) return shared;
  try {
    shared = typeof indexedDB === 'undefined' ? createMemoryStore() : createIdbStore();
  } catch {
    shared = createMemoryStore();
  }
  return shared;
}
