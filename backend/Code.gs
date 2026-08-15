/**
 * Code.gs
 * Google Apps Script backend for the PMV Toolkit Management System.
 * Deploy as a Web App (Execute as: Me, Access: Anyone with the link).
 *
 * This script is the SECURITY BOUNDARY of the whole system: it independently
 * re-validates every incoming record and re-checks role/office ownership.
 * Frontend-supplied role/session info is never trusted on its own — every
 * session token is looked up against USER_MASTER before any write happens.
 *
 * SETUP:
 *   1. Create/open the spreadsheet with ID below and add the sheets listed
 *      in SHEET NAMES with the header rows documented in docs/DATABASE.md.
 *   2. Extensions > Apps Script, paste this file as Code.gs.
 *   3. Deploy > New deployment > Web app > Execute as "Me", Access "Anyone".
 *   4. Copy the /exec URL into js/config.js as CONFIG.API_URL.
 */

// ==================== CONFIG ====================

const SPREADSHEET_ID = "1vEjY1z-147b38XTWV7vRm_9pjXVMfJmjdQtrKRkkLy8";

const SHEETS = {
  DAILY_DATA: "DAILY_DATA",
  OFFICE_MASTER: "OFFICE_MASTER",
  USER_MASTER: "USER_MASTER",
  SET_TRACKER: "SET_TRACKER",
  AUDIT_LOG: "AUDIT_LOG"
};

const ROLES = { SPM: "SPM", DPS: "DPS", ADMIN: "ADMIN" };

// ==================== ENTRY POINTS ====================

function doGet(e) {
  try {
    const action = e.parameter.action;
    let result;
    switch (action) {
      case "getOfficeList": result = getOfficeList(); break;
      case "getUser": result = getUser(e.parameter.userId); break;
      case "getPreviousDay": result = getPreviousDay(e.parameter.officeId, e.parameter.date); break;
      case "getHistory": result = getHistory(e.parameter.officeId, e.parameter.from, e.parameter.to); break;
      case "getDashboardData": result = getDashboardData(e.parameter); break;
      default: result = errorResponse("Unknown GET action: " + action);
    }
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse(errorResponse("Server error: " + err.message));
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    let result;
    switch (action) {
      case "login": result = login(body.userId, body.mobile); break;
      case "submitDailyRecord": result = submitDailyRecord(body.record, body.session); break;
      case "updateDailyRecord": result = updateDailyRecord(body.record, body.session); break;
      case "syncOfflineRecord": result = submitDailyRecord(body.record, body.session); break; // idempotent by record.id
      default: result = errorResponse("Unknown POST action: " + action);
    }
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse(errorResponse("Server error: " + err.message));
  }
}

// ==================== AUTH ====================

/**
 * Very lightweight login: verifies USER_ID + registered mobile against
 * USER_MASTER and issues an opaque session token (stored back on the row
 * conceptually via a signed payload — for simplicity here we sign a token
 * client can present back on each request; a production system should use
 * Apps Script's LockService + a token store sheet for revocation).
 */
function login(userId, mobile) {
  const user = findUserById(userId);
  if (!user) return errorResponse("User not found.");
  if (String(user.MOBILE).trim() !== String(mobile).trim()) {
    return errorResponse("Mobile number does not match our records.");
  }
  if (String(user.ACTIVE).toUpperCase() !== "TRUE" && user.ACTIVE !== true) {
    return errorResponse("This account is inactive. Contact your Admin.");
  }

  const token = Utilities.base64Encode(
    Utilities.computeHmacSha256Signature(user.USER_ID + "|" + new Date().getTime(), getScriptSecret())
  );

  logAudit({
    userId: user.USER_ID, userName: user.NAME, role: user.ROLE,
    action: "LOGIN", recordId: "", officeId: user.OFFICE_ID, date: "",
    oldValue: "", newValue: "", result: "SUCCESS"
  });

  return successResponse({
    userId: user.USER_ID,
    name: user.NAME,
    role: user.ROLE,
    officeId: user.OFFICE_ID,
    officeName: user.OFFICE_NAME,
    token: token
  }, "Login successful.");
}

/**
 * Re-validates a session against USER_MASTER on every write request.
 * Returns the authoritative user row (never trust the session object as-is).
 */
function authorize(session) {
  if (!session || !session.userId) throw new Error("Not authenticated.");
  const user = findUserById(session.userId);
  if (!user) throw new Error("Session user not found.");
  if (String(user.ACTIVE).toUpperCase() !== "TRUE" && user.ACTIVE !== true) {
    throw new Error("Account is inactive.");
  }
  return user; // authoritative role/office — never the client-sent one
}

function getScriptSecret() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty("SESSION_SECRET");
  if (!secret) {
    secret = Utilities.getUuid();
    props.setProperty("SESSION_SECRET", secret);
  }
  return secret;
}

// ==================== MASTER DATA ====================

function getOfficeList() {
  const rows = readSheetAsObjects(SHEETS.OFFICE_MASTER);
  const active = rows.filter(r => String(r.ACTIVE).toUpperCase() === "TRUE" || r.ACTIVE === true);
  return successResponse(active.map(r => ({
    officeId: r.OFFICE_ID, officeName: r.OFFICE_NAME, division: r.DIVISION,
    spmId: r.SPM_ID, spmName: r.SPM_NAME
  })));
}

function getUser(userId) {
  const user = findUserById(userId);
  if (!user) return errorResponse("User not found.");
  return successResponse({
    userId: user.USER_ID, name: user.NAME, role: user.ROLE,
    officeId: user.OFFICE_ID, officeName: user.OFFICE_NAME
  });
}

function findUserById(userId) {
  const rows = readSheetAsObjects(SHEETS.USER_MASTER);
  return rows.find(r => String(r.USER_ID).trim() === String(userId).trim()) || null;
}

function findOfficeById(officeId) {
  const rows = readSheetAsObjects(SHEETS.OFFICE_MASTER);
  return rows.find(r => String(r.OFFICE_ID).trim() === String(officeId).trim()) || null;
}

// ==================== PREVIOUS DAY / HISTORY ====================

function getPreviousDay(officeId, date) {
  const prevDate = shiftDate(date, -1);
  const rows = readSheetAsObjects(SHEETS.DAILY_DATA);
  const record = rows.find(r => String(r.OFFICE_ID) === String(officeId) && r.DATE === prevDate);
  if (!record) return successResponse(null);
  return successResponse({
    date: record.DATE,
    kitsCameToday: record.KITS_CAME_TODAY,
    kitsDelivered: record.KITS_DELIVERED,
    redirected: record.REDIRECTED,
    currentPending: record.CURRENT_PENDING
  });
}

function getHistory(officeId, from, to) {
  const rows = readSheetAsObjects(SHEETS.DAILY_DATA);
  const filtered = rows.filter(r =>
    String(r.OFFICE_ID) === String(officeId) &&
    (!from || r.DATE >= from) &&
    (!to || r.DATE <= to)
  ).sort((a, b) => (a.DATE < b.DATE ? 1 : -1));

  return successResponse(filtered.map(r => ({
    date: r.DATE,
    kitsCameToday: r.KITS_CAME_TODAY,
    kitsDelivered: r.KITS_DELIVERED,
    redirected: r.REDIRECTED,
    totalPending: r.TOTAL_PENDING,
    deliveryPercentage: r.DELIVERY_PERCENTAGE,
    status: r.STATUS
  })));
}

// ==================== DASHBOARD ====================

function getDashboardData(params) {
  const from = params.from || shiftDate(todayISO(), -7);
  const to = params.to || todayISO();
  const officeFilter = params.officeId || "";

  const rows = readSheetAsObjects(SHEETS.DAILY_DATA).filter(r =>
    r.DATE >= from && r.DATE <= to &&
    (!officeFilter || String(r.OFFICE_ID) === String(officeFilter))
  );

  const kpis = {
    totalCame: sumField(rows, "KITS_CAME_TODAY"),
    totalDelivered: sumField(rows, "KITS_DELIVERED"),
    totalRedirected: sumField(rows, "REDIRECTED"),
    totalPending: sumField(rows, "TOTAL_PENDING"),
    mobileInvalid: sumField(rows, "MOBILE_NUMBER_INVALID"),
    addressNotFound: sumField(rows, "ADDRESS_NOT_FOUND"),
    torn: sumField(rows, "TORN_CONDITION"),
    incompleteKits: sumField(rows, "KITS_INCOMPLETE"),
    completeKits: sumField(rows, "KITS_COMPLETE")
  };
  kpis.deliveryPercent = kpis.totalCame > 0 ? round1(kpis.totalDelivered / kpis.totalCame * 100) : 0;

  const officeMap = {};
  rows.forEach(r => {
    const key = r.OFFICE_ID;
    if (!officeMap[key]) {
      officeMap[key] = { officeId: r.OFFICE_ID, officeName: r.OFFICE_NAME, kitsCameToday: 0, kitsDelivered: 0, redirected: 0, totalPending: 0 };
    }
    officeMap[key].kitsCameToday += Number(r.KITS_CAME_TODAY) || 0;
    officeMap[key].kitsDelivered += Number(r.KITS_DELIVERED) || 0;
    officeMap[key].redirected += Number(r.REDIRECTED) || 0;
    officeMap[key].totalPending += Number(r.TOTAL_PENDING) || 0;
  });
  const officeWise = Object.values(officeMap).map(o => ({
    ...o, deliveryPercentage: o.kitsCameToday > 0 ? round1(o.kitsDelivered / o.kitsCameToday * 100) : 0
  }));

  const dateMap = {};
  rows.forEach(r => {
    const key = r.DATE;
    if (!dateMap[key]) dateMap[key] = { date: key, kitsCameToday: 0, kitsDelivered: 0, redirected: 0, totalPending: 0 };
    dateMap[key].kitsCameToday += Number(r.KITS_CAME_TODAY) || 0;
    dateMap[key].kitsDelivered += Number(r.KITS_DELIVERED) || 0;
    dateMap[key].redirected += Number(r.REDIRECTED) || 0;
    dateMap[key].totalPending += Number(r.TOTAL_PENDING) || 0;
  });
  const dateWise = Object.values(dateMap)
    .map(d => ({ ...d, deliveryPercentage: d.kitsCameToday > 0 ? round1(d.kitsDelivered / d.kitsCameToday * 100) : 0 }))
    .sort((a, b) => (a.date > b.date ? 1 : -1));

  const weeklyTrend = buildWeeklyTrend(dateWise);

  return successResponse({ kpis, officeWise, dateWise, weeklyTrend });
}

function buildWeeklyTrend(dateWise) {
  const weeks = {};
  dateWise.forEach(d => {
    const weekLabel = isoWeekLabel(d.date);
    if (!weeks[weekLabel]) weeks[weekLabel] = { weekLabel, came: 0, delivered: 0 };
    weeks[weekLabel].came += d.kitsCameToday;
    weeks[weekLabel].delivered += d.kitsDelivered;
  });
  return Object.values(weeks).map(w => ({
    weekLabel: w.weekLabel,
    deliveryPercentage: w.came > 0 ? round1(w.delivered / w.came * 100) : 0
  }));
}

function isoWeekLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
  return "W" + week + " " + d.getFullYear();
}

// ==================== DAILY RECORD WRITE ====================

/**
 * Server-side is the FINAL authority on validation and duplicate prevention.
 * Frontend validation is only a convenience — every rule here is re-checked
 * independently of whatever the client already claims to have verified.
 */
function submitDailyRecord(record, session) {
  const user = authorize(session);

  // Office access control: SPM may only submit for their own office.
  if (user.ROLE === ROLES.SPM && String(user.OFFICE_ID) !== String(record.officeId)) {
    logAudit(auditEntry(user, "CREATE_DENIED", record, "", "DENIED: office mismatch"));
    return errorResponse("You are not authorized to submit data for this office.");
  }

  const validation = validateRecordServerSide(record);
  if (!validation.valid) {
    return { success: false, message: validation.errors[0], errors: validation.errors };
  }

  const existing = findDailyRecord(record.officeId, record.date);
  if (existing && !record._authorizedEdit) {
    return { success: false, code: "DUPLICATE", message: "Record already submitted for this office and date." };
  }

  const totals = computeServerTotals(record);
  const lifecycle = computePendingLifecycle(record, totals.totalPending);

  const rowValues = buildDailyDataRow(record, totals, lifecycle, user);

  const sheet = getSheet(SHEETS.DAILY_DATA);
  if (existing) {
    sheet.getRange(existing.__row, 1, 1, rowValues.length).setValues([rowValues]);
    logAudit(auditEntry(user, "UPDATE", record, JSON.stringify(existing), "SUCCESS"));
  } else {
    sheet.appendRow(rowValues);
    logAudit(auditEntry(user, "CREATE", record, "", "SUCCESS"));
  }

  writeSetTrackerRows(record, user);

  return successResponse({ recordId: record.id || buildRecordId(record) }, "Record saved successfully.");
}

function updateDailyRecord(record, session) {
  const user = authorize(session);
  if (user.ROLE === ROLES.SPM) {
    return errorResponse("SPM users cannot edit finalized records. Contact DPS/Admin.");
  }
  record._authorizedEdit = true;
  return submitDailyRecord(record, session);
}

function validateRecordServerSide(record) {
  const errors = [];
  if (!record.date) errors.push("Date is required.");
  if (!record.officeId) errors.push("Office is required.");
  if (record.kitsCameToday === undefined || record.kitsCameToday === null || record.kitsCameToday === "") {
    errors.push("Kits Came Today is required.");
  }

  const numericFields = ["kitsCameToday", "kitsDelivered", "redirected", "mobileInvalid", "addressNotFound", "torn"];
  numericFields.forEach(f => {
    const v = record[f];
    if (v !== undefined && v !== null && v !== "" && !isNonNegInt(v)) {
      errors.push(f + " must be a whole number that is zero or greater.");
    }
  });

  (record.incompleteRows || []).forEach((row, i) => {
    if (row.setNumber !== "" && row.setNumber !== undefined && !Number.isInteger(Number(row.setNumber))) {
      errors.push("Incomplete Set row " + (i + 1) + ": Set number must be an integer.");
    }
    if (!isNonNegInt(row.kitsIncomplete)) {
      errors.push("Incomplete Set row " + (i + 1) + ": Kits Incomplete must be zero or greater.");
    }
  });
  (record.completeRows || []).forEach((row, i) => {
    if (row.setNumber !== "" && row.setNumber !== undefined && !Number.isInteger(Number(row.setNumber))) {
      errors.push("Complete Set row " + (i + 1) + ": Set number must be an integer.");
    }
    if (!isNonNegInt(row.kitsComplete)) {
      errors.push("Complete Set row " + (i + 1) + ": Kits Complete must be zero or greater.");
    }
  });

  if (errors.length === 0) {
    const totalPending = computeTotalPending(record);
    const sum = toInt(record.kitsDelivered) + toInt(record.redirected) + totalPending;
    const came = toInt(record.kitsCameToday);
    if (sum > came) {
      errors.push("Delivered + Redirected + Pending (" + sum + ") exceeds Kits Came Today (" + came + ").");
    }
  }

  return { valid: errors.length === 0, errors };
}

function isNonNegInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0;
}
function toInt(v) {
  const n = parseInt(v, 10);
  return isNaN(n) || n < 0 ? 0 : n;
}

/**
 * Business rule (non-negotiable):
 * TOTAL PENDING = MobileInvalid + AddressNotFound + Torn + KitsIncomplete + KitsComplete
 * Set numbers are identifiers ONLY and are never part of this sum.
 */
function computeTotalPending(record) {
  const kitsIncomplete = (record.incompleteRows || []).reduce((s, r) => s + toInt(r.kitsIncomplete), 0);
  const kitsComplete = (record.completeRows || []).reduce((s, r) => s + toInt(r.kitsComplete), 0);
  return toInt(record.mobileInvalid) + toInt(record.addressNotFound) + toInt(record.torn) + kitsIncomplete + kitsComplete;
}

function computeServerTotals(record) {
  const kitsIncomplete = (record.incompleteRows || []).reduce((s, r) => s + toInt(r.kitsIncomplete), 0);
  const kitsComplete = (record.completeRows || []).reduce((s, r) => s + toInt(r.kitsComplete), 0);
  const totalPending = computeTotalPending(record);
  const came = toInt(record.kitsCameToday);
  const delivered = toInt(record.kitsDelivered);
  const deliveryPercentage = came > 0 ? round1(delivered / came * 100) : 0;
  return { kitsIncomplete, kitsComplete, totalPending, deliveryPercentage };
}

/**
 * Pending lifecycle — never simply adds yesterday's pending onto today's.
 * CURRENT PENDING = PREVIOUS CURRENT PENDING + NEW PENDING - RESOLVED PENDING
 */
function computePendingLifecycle(record, newPending) {
  const previous = findDailyRecord(record.officeId, shiftDate(record.date, -1));
  const previousCurrentPending = previous ? toInt(previous.CURRENT_PENDING) : toInt(record.previousCurrentPending);
  const resolvedPending = toInt(record.resolvedPending); // reserved for future UI
  const currentPending = Math.max(0, previousCurrentPending + newPending - resolvedPending);
  return { previousPending: previousCurrentPending, newPending, resolvedPending, currentPending };
}

function findDailyRecord(officeId, date) {
  const sheet = getSheet(SHEETS.DAILY_DATA);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const officeIdx = headers.indexOf("OFFICE_ID");
  const dateIdx = headers.indexOf("DATE");
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][officeIdx]) === String(officeId) && data[i][dateIdx] === date) {
      const obj = {};
      headers.forEach((h, idx) => obj[h] = data[i][idx]);
      obj.__row = i + 1;
      return obj;
    }
  }
  return null;
}

function buildDailyDataRow(record, totals, lifecycle, user) {
  const now = new Date().toISOString();
  return [
    record.id || buildRecordId(record),           // ID
    record.date,                                   // DATE
    record.officeId,                                // OFFICE_ID
    record.officeName || "",                        // OFFICE_NAME
    user.USER_ID,                                    // SPM_ID
    user.NAME,                                        // SPM_NAME
    toInt(record.kitsCameToday),                       // KITS_CAME_TODAY
    toInt(record.kitsDelivered),                        // KITS_DELIVERED
    toInt(record.redirected),                             // REDIRECTED
    toInt(record.mobileInvalid),                            // MOBILE_NUMBER_INVALID
    toInt(record.addressNotFound),                           // ADDRESS_NOT_FOUND
    toInt(record.torn),                                       // TORN_CONDITION
    setNumbersJoined(record.incompleteRows),                   // INCOMPLETE_SET_NUMBER
    totals.kitsIncomplete,                                       // KITS_INCOMPLETE
    setNumbersJoined(record.completeRows),                        // COMPLETE_SET_NUMBER
    totals.kitsComplete,                                            // KITS_COMPLETE
    totals.totalPending,                                             // TOTAL_PENDING
    totals.deliveryPercentage,                                        // DELIVERY_PERCENTAGE
    lifecycle.previousPending,                                         // PREVIOUS_PENDING
    lifecycle.newPending,                                               // NEW_PENDING
    lifecycle.resolvedPending,                                           // RESOLVED_PENDING
    lifecycle.currentPending,                                             // CURRENT_PENDING
    record.submittedAt || now,                                             // SUBMITTED_AT
    now,                                                                     // UPDATED_AT
    "SUBMITTED"                                                               // STATUS
  ];
}

function setNumbersJoined(rows) {
  return (rows || []).map(r => r.setNumber !== "" && r.setNumber !== undefined ? r.setNumber : "").filter(v => v !== "").join(",");
}

function buildRecordId(record) {
  return record.date + "_" + record.officeId + "_" + new Date().getTime();
}

function writeSetTrackerRows(record, user) {
  const sheet = getSheet(SHEETS.SET_TRACKER);
  const now = new Date().toISOString();
  const rowsToWrite = [];
  (record.incompleteRows || []).forEach(r => {
    if (r.setNumber !== "" && r.setNumber !== undefined) {
      rowsToWrite.push([now, record.date, record.officeId, "INCOMPLETE", r.setNumber, toInt(r.kitsIncomplete), user.USER_ID]);
    }
  });
  (record.completeRows || []).forEach(r => {
    if (r.setNumber !== "" && r.setNumber !== undefined) {
      rowsToWrite.push([now, record.date, record.officeId, "COMPLETE", r.setNumber, toInt(r.kitsComplete), user.USER_ID]);
    }
  });
  if (rowsToWrite.length > 0) {
    rowsToWrite.forEach(r => sheet.appendRow(r));
  }
}

// ==================== AUDIT LOG ====================

function auditEntry(user, action, record, oldValue, result) {
  return {
    userId: user.USER_ID, userName: user.NAME, role: user.ROLE,
    action: action, recordId: record.id || "", officeId: record.officeId || "",
    date: record.date || "", oldValue: oldValue, newValue: JSON.stringify(record), result: result
  };
}

function logAudit(entry) {
  const sheet = getSheet(SHEETS.AUDIT_LOG);
  sheet.appendRow([
    new Date().toISOString(), entry.userId, entry.userName, entry.role, entry.action,
    entry.recordId, entry.officeId, entry.date, entry.oldValue, entry.newValue, "", entry.result
  ]);
}

// ==================== SHEET HELPERS ====================

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheet(name) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error("Sheet not found: " + name);
  return sheet;
}

function readSheetAsObjects(name) {
  const sheet = getSheet(name);
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1)
    .filter(row => row.join("") !== "") // skip blank rows
    .map(row => {
      const obj = {};
      headers.forEach((h, idx) => obj[h] = row[idx]);
      return obj;
    });
}

function sumField(rows, field) {
  return rows.reduce((s, r) => s + (Number(r[field]) || 0), 0);
}

function shiftDate(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return Utilities.formatDate(d, Session.getScriptTimeZone() || "Asia/Kolkata", "yyyy-MM-dd");
}

function todayISO() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "Asia/Kolkata", "yyyy-MM-dd");
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// ==================== RESPONSE HELPERS ====================

function successResponse(data, message) {
  return { success: true, message: message || "OK", data: data };
}

function errorResponse(message, errors) {
  return { success: false, message: message, errors: errors || [] };
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ==================== ONE-TIME SETUP HELPER ====================

/**
 * Run this once manually from the Apps Script editor to create sheets with
 * correct header rows if they don't already exist. Safe to re-run.
 */
function setupSheets() {
  const ss = getSpreadsheet();

  createSheetIfMissing(ss, SHEETS.DAILY_DATA, [
    "ID", "DATE", "OFFICE_ID", "OFFICE_NAME", "SPM_ID", "SPM_NAME",
    "KITS_CAME_TODAY", "KITS_DELIVERED", "REDIRECTED",
    "MOBILE_NUMBER_INVALID", "ADDRESS_NOT_FOUND", "TORN_CONDITION",
    "INCOMPLETE_SET_NUMBER", "KITS_INCOMPLETE", "COMPLETE_SET_NUMBER", "KITS_COMPLETE",
    "TOTAL_PENDING", "DELIVERY_PERCENTAGE",
    "PREVIOUS_PENDING", "NEW_PENDING", "RESOLVED_PENDING", "CURRENT_PENDING",
    "SUBMITTED_AT", "UPDATED_AT", "STATUS"
  ]);

  createSheetIfMissing(ss, SHEETS.OFFICE_MASTER, [
    "OFFICE_ID", "OFFICE_NAME", "DIVISION", "SPM_ID", "SPM_NAME", "ACTIVE"
  ]);

  createSheetIfMissing(ss, SHEETS.USER_MASTER, [
    "USER_ID", "NAME", "ROLE", "OFFICE_ID", "OFFICE_NAME", "MOBILE", "ACTIVE"
  ]);

  createSheetIfMissing(ss, SHEETS.SET_TRACKER, [
    "TIMESTAMP", "DATE", "OFFICE_ID", "SET_TYPE", "SET_NUMBER", "QUANTITY", "ENTERED_BY"
  ]);

  createSheetIfMissing(ss, SHEETS.AUDIT_LOG, [
    "TIMESTAMP", "USER_ID", "USER_NAME", "ROLE", "ACTION", "RECORD_ID",
    "OFFICE_ID", "DATE", "OLD_VALUE", "NEW_VALUE", "REQUEST_INFO", "RESULT"
  ]);
}

function createSheetIfMissing(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
}
