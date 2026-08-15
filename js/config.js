/**
 * config.js
 * Central configuration for the PMV Toolkit Management System.
 * NOTE: Never place passwords, service-account keys, or OAuth secrets here.
 * The API_URL is a public Apps Script Web App URL (deployed with "Anyone" access);
 * real authorization is enforced server-side in Code.gs against USER_MASTER.
 */

const CONFIG = Object.freeze({
  // Replace with your deployed Apps Script Web App URL, e.g.
  // "https://script.google.com/macros/s/AKfycb.../exec"
  API_URL: "YOUR_APPS_SCRIPT_WEB_APP_URL",

  APP_NAME: "PMV Toolkit Management System",
  SHORT_NAME: "PMV Tracker",
  VERSION: "1.0.0",
  DIVISION_NAME: "Udhampur Division",

  ROLES: Object.freeze({ SPM: "SPM", DPS: "DPS", ADMIN: "ADMIN" }),

  // IndexedDB
  DB_NAME: "pmv_toolkit_db",
  DB_VERSION: 1,
  STORE_DRAFTS: "drafts",
  STORE_PENDING_SYNC: "pending_sync",
  STORE_HISTORY_CACHE: "history_cache",
  STORE_SESSION: "session",

  SYNC_RETRY_INTERVAL_MS: 30000
});
