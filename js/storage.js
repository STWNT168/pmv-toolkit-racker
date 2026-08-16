/**
 * IndexedDB storage.
 * Version 2 adds safer queue metadata while preserving the same store names.
 */
const Storage = (() => {
  let dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);

      request.onupgradeneeded = event => {
        const db = event.target.result;

        if (!db.objectStoreNames.contains(CONFIG.STORE_DRAFTS)) {
          db.createObjectStore(CONFIG.STORE_DRAFTS, { keyPath: "recordKey" });
        }

        if (!db.objectStoreNames.contains(CONFIG.STORE_PENDING_SYNC)) {
          db.createObjectStore(CONFIG.STORE_PENDING_SYNC, { keyPath: "id" });
        }

        if (!db.objectStoreNames.contains(CONFIG.STORE_HISTORY_CACHE)) {
          db.createObjectStore(CONFIG.STORE_HISTORY_CACHE, { keyPath: "cacheKey" });
        }

        if (!db.objectStoreNames.contains(CONFIG.STORE_SESSION)) {
          db.createObjectStore(CONFIG.STORE_SESSION, { keyPath: "key" });
        }
      };

      request.onsuccess = event => resolve(event.target.result);
      request.onerror = event => reject(event.target.error);
    });

    return dbPromise;
  }

  async function put(storeName, value) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(value);
      tx.oncomplete = () => resolve(value);
      tx.onerror = e => reject(e.target.error);
    });
  }

  async function get(storeName, key) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const request = tx.objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = e => reject(e.target.error);
    });
  }

  async function getAll(storeName) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const request = tx.objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = e => reject(e.target.error);
    });
  }

  async function remove(storeName, key) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = e => reject(e.target.error);
    });
  }

  function draftKey(date, officeId) {
    return `${date}_${officeId}`;
  }

  async function saveDraft(date, officeId, formData) {
    return put(CONFIG.STORE_DRAFTS, {
      recordKey: draftKey(date, officeId),
      date,
      officeId,
      formData,
      savedAt: new Date().toISOString()
    });
  }

  async function getDraft(date, officeId) {
    return get(CONFIG.STORE_DRAFTS, draftKey(date, officeId));
  }

  async function clearDraft(date, officeId) {
    return remove(CONFIG.STORE_DRAFTS, draftKey(date, officeId));
  }

  async function queueForSync(record) {
    const existing = await get(CONFIG.STORE_PENDING_SYNC, record.id);

    return put(CONFIG.STORE_PENDING_SYNC, {
      ...(existing || {}),
      ...record,
      syncStatus: "pending",
      queuedAt: existing?.queuedAt || new Date().toISOString(),
      attempts: existing?.attempts || 0
    });
  }

  async function getPendingSyncRecords() {
    return getAll(CONFIG.STORE_PENDING_SYNC);
  }

  async function markSynced(id) {
    return remove(CONFIG.STORE_PENDING_SYNC, id);
  }

  async function markSyncError(id, message) {
    const existing = await get(CONFIG.STORE_PENDING_SYNC, id);
    if (!existing) return;

    existing.syncStatus = "error";
    existing.lastError = message;
    existing.attempts = (existing.attempts || 0) + 1;
    existing.lastAttemptAt = new Date().toISOString();

    return put(CONFIG.STORE_PENDING_SYNC, existing);
  }

  async function cacheHistory(cacheKey, payload) {
    return put(CONFIG.STORE_HISTORY_CACHE, {
      cacheKey,
      payload,
      cachedAt: new Date().toISOString()
    });
  }

  async function getCachedHistory(cacheKey) {
    const entry = await get(CONFIG.STORE_HISTORY_CACHE, cacheKey);
    return entry ? entry.payload : null;
  }

  async function saveSession(sessionData) {
    return put(CONFIG.STORE_SESSION, {
      key: "current",
      ...sessionData
    });
  }

  async function getSession() {
    return get(CONFIG.STORE_SESSION, "current");
  }

  async function clearSession() {
    return remove(CONFIG.STORE_SESSION, "current");
  }

  return {
    saveDraft,
    getDraft,
    clearDraft,
    queueForSync,
    getPendingSyncRecords,
    markSynced,
    markSyncError,
    cacheHistory,
    getCachedHistory,
    saveSession,
    getSession,
    clearSession
  };
})();
