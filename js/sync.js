/**
 * Offline synchronisation.
 *
 * Only network/server availability failures remain queued.
 * Validation, duplicate, authorization and expired-session errors are
 * permanent failures and are NOT retried forever.
 */
const Sync = (() => {
  let retryTimer = null;
  let onStatusChange = () => {};
  let running = false;

  function init(statusCallback) {
    if (typeof statusCallback === "function") onStatusChange = statusCallback;

    window.addEventListener("online", () => syncPendingRecords());
    window.addEventListener("offline", () => onStatusChange({ online: false }));

    retryTimer = setInterval(syncPendingRecords, CONFIG.SYNC_RETRY_INTERVAL_MS);

    if (navigator.onLine) syncPendingRecords();
  }

  async function syncPendingRecords() {
    if (running) return;
    if (!navigator.onLine) {
      onStatusChange({ online: false });
      return;
    }

    const pending = await Storage.getPendingSyncRecords();

    if (!pending.length) {
      onStatusChange({ online: true, pendingCount: 0 });
      return;
    }

    const session = Auth.getSession();

    if (!session) {
      onStatusChange({
        online: true,
        syncing: false,
        pendingCount: pending.length,
        authRequired: true
      });
      return;
    }

    running = true;
    onStatusChange({ online: true, syncing: true, pendingCount: pending.length });

    try {
      for (const record of pending) {
        try {
          const result = await Api.syncOfflineRecord(record, session);

          if (result.success) {
            await Storage.markSynced(record.id);
            continue;
          }

          const permanent =
            result.code === "VALIDATION" ||
            result.code === "DUPLICATE" ||
            /not authorized|session expired|invalid session|inactive/i.test(result.message || "");

          if (permanent) {
            await Storage.markSyncError(
              record.id,
              "PERMANENT: " + (result.message || "Server rejected the record.")
            );
            continue;
          }

          await Storage.markSyncError(record.id, result.message || "Server rejected the record.");
        } catch (err) {
          await Storage.markSyncError(record.id, err.message || "Network error during sync.");
        }
      }
    } finally {
      running = false;
    }

    const remaining = await Storage.getPendingSyncRecords();
    onStatusChange({
      online: true,
      syncing: false,
      pendingCount: remaining.length
    });
  }

  function stop() {
    if (retryTimer) clearInterval(retryTimer);
  }

  return { init, syncPendingRecords, stop };
})();
