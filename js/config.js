/**
 * Central configuration.
 * No passwords or secrets belong in this file.
 */
const CONFIG = Object.freeze({
  API_URL: "https://script.google.com/macros/s/AKfycbx-OuPXs75xUz6cKOEtU-UGkjdA37LP53DMW5hU8nIEWlniAzZ3ztLF7iIaCk7l17WSRQ/exec",

  APP_NAME: "PMV Toolkit Management System",
  SHORT_NAME: "PMV Tracker",
  VERSION: "1.1.0",
  DIVISION_NAME: "Udhampur Division",

  ROLES: Object.freeze({
    SPM: "SPM",
    DPS: "DPS",
    ADMIN: "ADMIN"
  }),

  DB_NAME: "pmv_toolkit_db",
  DB_VERSION: 2,
  STORE_DRAFTS: "drafts",
  STORE_PENDING_SYNC: "pending_sync",
  STORE_HISTORY_CACHE: "history_cache",
  STORE_SESSION: "session",

  SYNC_RETRY_INTERVAL_MS: 30000,
  SYNC_MAX_BACKOFF_MS: 15 * 60 * 1000
});
