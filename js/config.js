/**
 * Central configuration.
 * V5.0.4 dashboard/API fix.
 */
const CONFIG = Object.freeze({
  API_URL: "https://script.google.com/macros/s/AKfycbxRqGsRp8mkVQL2KOYYUZyReglMJjfsEc7LX-gtrX7XIo9J5tI4v-EBdDm2kI86iAzI/exec",
  APP_NAME: "PMV Toolkit Management System",
  SHORT_NAME: "PMV Tracker",
  VERSION: "5.0.4",
  DIVISION_NAME: "Udhampur Division",
  ROLES: Object.freeze({ SPM: "SPM", DPS: "DPS", ADMIN: "ADMIN" }),
  DB_NAME: "pmv_toolkit_db",
  DB_VERSION: 3,
  STORE_DRAFTS: "drafts",
  STORE_PENDING_SYNC: "pending_sync",
  STORE_HISTORY_CACHE: "history_cache",
  STORE_SESSION: "session",
  SYNC_RETRY_INTERVAL_MS: 30000,
  SYNC_MAX_BACKOFF_MS: 15 * 60 * 1000
});
