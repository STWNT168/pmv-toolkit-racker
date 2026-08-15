/**
 * sync.js
 * Handles background synchronization of offline-queued records.
 *
 * Flow:
 *   Local record -> check connectivity -> POST to Apps Script ->
 *   backend validation -> write to Google Sheets -> success ->
 *   mark local record synced.
 * On failure: keep local record and retry later. The record's client-generated
 * "id" is used server-side as the idempotency key, so retries never duplicate.
 */

const Sync = (() => {
  let retryTimer = null;
  let onStatusChange = () => {};

  function init(statusCallback) {
    if (typeof statusCallback === "function") onStatusChange = statusCallback;

    window.addEventListener("online", () => syncPendingRecords());
    window.addEventListener("offline", () => onStatusChange({ online: false }));

    // Periodic retry in case 'online' event was missed
    retryTimer = setInterval(syncPendingRecords, CONFIG.SYNC_RETRY_INTERVAL_MS);

    if (navigator.onLine) syncPendingRecords();
  }

  async function syncPendingRecords() {
    if (!navigator.onLine) {
      onStatusChange({ online: false });
      return;
    }

    const pending = await Storage.getPendingSyncRecords();
    if (pending.length === 0) {
      onStatusChange({ online: true, pendingCount: 0 });
      return;
    }

    onStatusChange({ online: true, syncing: true, pendingCount: pending.length });

    const session = Auth.getSession();

    for (const record of pending) {
      try {
        const result = await Api.syncOfflineRecord(record, session);
        if (result.success) {
          await Storage.markSynced(record.id);
        } else {
          await Storage.markSyncError(record.id, result.message || "Sync rejected by server.");
        }
      } catch (err) {
        // Network or server error — keep the record queued, try again later
        await Storage.markSyncError(record.id, err.message || "Network error during sync.");
      }
    }

    const remaining = await Storage.getPendingSyncRecords();
    onStatusChange({ online: true, syncing: false, pendingCount: remaining.length });
  }

  function stop() {
    if (retryTimer) clearInterval(retryTimer);
  }

  return { init, syncPendingRecords, stop };
})();
