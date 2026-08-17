const CONFIG = Object.freeze({
  API_URL: "https://script.google.com/macros/s/AKfycbwqvDnfAC6ICego36HMebIJPm-n2NW_zr_UOa9Hxmyi-KvH5uHARSkCAUD9zl9r1qHDvg/exec",
  APP_NAME: "PMV Toolkit Management System",
  SHORT_NAME: "PMV Tracker",
  VERSION: "5.0.7",
  DIVISION_NAME: "Udhampur Division",
  ROLES: Object.freeze({SPM:"SPM",DPS:"DPS",ADMIN:"ADMIN"}),
  DB_NAME: "pmv_toolkit_db",
  DB_VERSION: 5,
  STORE_DRAFTS: "drafts",
  STORE_PENDING_SYNC: "pending_sync",
  STORE_HISTORY_CACHE: "history_cache",
  STORE_SESSION: "session",
  SYNC_RETRY_INTERVAL_MS: 30000,
  SW_CACHE: "pmv-toolkit-v5.0.7"
});
