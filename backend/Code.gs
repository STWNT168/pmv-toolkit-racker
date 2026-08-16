/**
 * PMV Toolkit Management System - Google Apps Script backend
 *
 * SECURITY MODEL
 * - USER_ID + MOBILE is used only at login.
 * - Every subsequent request must present a server-issued session token.
 * - Sessions are stored in the SESSIONS sheet and expire automatically.
 * - Role and office are always read from USER_MASTER.
 * - SPM can create records only for their own active office.
 * - DPS/ADMIN can read all permitted data and edit existing records.
 * - Client-side "_authorizedEdit" is NEVER trusted.
 * - record.id is the idempotency key for offline retries.
 * - SPM_ID + DATE is the business uniqueness key for finalized submissions.
 * - Existing historical duplicate rows are never deleted; reads deduplicate them.
 */

const SPREADSHEET_ID = "1vEjY1z-147b38XTWV7vRm_9pjXVMfJmjdQtrKRkkLy8";

const SHEETS = Object.freeze({
  DAILY_DATA: "DAILY_DATA",
  OFFICE_MASTER: "OFFICE_MASTER",
  USER_MASTER: "USER_MASTER",
  SET_TRACKER: "SET_TRACKER",
  AUDIT_LOG: "AUDIT_LOG",
  SESSIONS: "SESSIONS"
});

const ROLES = Object.freeze({
  SPM: "SPM",
  DPS: "DPS",
  ADMIN: "ADMIN"
});

const SESSION_DAYS = 7;

// ==================== ENTRY POINTS ====================

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    const action = p.action;
    let result;

    switch (action) {
      case "getOfficeList":
        result = getOfficeList(requireSessionParam(p.session));
        break;
      case "getUser":
        result = getUser(p.userId, requireSessionParam(p.session));
        break;
      case "getPreviousDay":
        result = getPreviousDay(p.officeId, p.date, requireSessionParam(p.session));
        break;
      case "getHistory":
        result = getHistory(p.officeId, p.from, p.to, requireSessionParam(p.session));
        break;
      case "getDashboardData":
        result = getDashboardData(p, requireSessionParam(p.session));
        break;
      case "getAdminTodayUpdateStatus":
        result = getAdminTodayUpdateStatus(
          requireSessionParam(p.session),
          p.date || todayISO()
        );
        break;
      case "getOwnTodayRecord":
        result = getOwnTodayRecord(requireSessionParam(p.session));
        break;
      case "deleteOwnTodayRecord":
        result = deleteOwnTodayRecord(requireSessionParam(p.session), p.recordId || "");
        break;
      case "getAdminTodayUpdateStatus":
        result = getAdminTodayUpdateStatus(requireSessionParam(p.session), p.date || todayISO());
        break;
      default:
        result = errorResponse("Unknown GET action.");
    }

    return jsonResponse(result);
  } catch (err) {
    return jsonResponse(errorResponse(err.message || "Server error."));
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const action = body.action;
    let result;

    switch (action) {
      case "login":
        result = login(body.userId, body.mobile);
        break;
      case "logout":
        result = logout(body.session);
        break;
      case "submitDailyRecord":
        result = submitDailyRecord(body.record, body.session);
        break;
      case "syncOfflineRecord":
        result = syncOfflineRecord(body.record, body.session);
        break;
      case "updateDailyRecord":
        result = updateDailyRecord(body.record, body.session);
        break;
      default:
        result = errorResponse("Unknown POST action.");
    }

    return jsonResponse(result);
  } catch (err) {
    return jsonResponse(errorResponse(err.message || "Server error."));
  }
}

// ==================== AUTH ====================

function login(userId, mobile) {
  userId = String(userId || "").trim();
  mobile = String(mobile || "").trim();

  if (!userId || !mobile) return errorResponse("User ID and mobile number are required.");

  const user = findUserById(userId);
  if (!user) return errorResponse("User not found.");

  if (String(user.MOBILE || "").trim() !== mobile) {
    return errorResponse("Mobile number does not match our records.");
  }

  if (!isActive(user.ACTIVE)) {
    return errorResponse("This account is inactive. Contact your Admin.");
  }

  const role = normalizeRole(user.ROLE);
  if (!role) return errorResponse("Invalid role configured for this user.");

  const token = Utilities.getUuid() + "-" + Utilities.getUuid();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  const sheet = getSheet(SHEETS.SESSIONS);
  sheet.appendRow([
    token,
    user.USER_ID,
    now,
    expires,
    true
  ]);

  logAudit({
    userId: user.USER_ID,
    userName: user.NAME,
    role: role,
    action: "LOGIN",
    recordId: "",
    officeId: user.OFFICE_ID,
    date: "",
    oldValue: "",
    newValue: "",
    requestInfo: "",
    result: "SUCCESS"
  });

  return successResponse({
    userId: user.USER_ID,
    name: user.NAME,
    role: role,
    officeId: user.OFFICE_ID,
    officeName: getAuthoritativeOfficeName(user.OFFICE_ID, user.OFFICE_NAME),
    token: token,
    expiresAt: expires.toISOString()
  }, "Login successful.");
}

function logout(session) {
  try {
    const auth = authorize(session);
    const token = String(session.token);
    const sheet = getSheet(SHEETS.SESSIONS);
    const rows = sheet.getDataRange().getValues();

    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) === token) {
        sheet.getRange(i + 1, 5).setValue(false);
        break;
      }
    }

    logAudit({
      userId: auth.user.USER_ID,
      userName: auth.user.NAME,
      role: auth.user.ROLE,
      action: "LOGOUT",
      recordId: "",
      officeId: auth.user.OFFICE_ID,
      date: "",
      oldValue: "",
      newValue: "",
      requestInfo: "",
      result: "SUCCESS"
    });

    return successResponse(null, "Logged out.");
  } catch (err) {
    return errorResponse(err.message || "Logout failed.");
  }
}

function requireSessionParam(raw) {
  if (!raw) throw new Error("Not authenticated.");
  let session;
  try {
    session = JSON.parse(raw);
  } catch (err) {
    throw new Error("Invalid session.");
  }
  return session;
}

function authorize(session) {
  if (!session || !session.userId || !session.token) {
    throw new Error("Not authenticated.");
  }

  const token = String(session.token).trim();
  const userId = String(session.userId).trim();
  if (!token || !userId) throw new Error("Not authenticated.");

  const sessionRow = findSession(token);
  if (!sessionRow) throw new Error("Session expired or invalid.");

  if (String(sessionRow.USER_ID).trim() !== userId) {
    throw new Error("Invalid session.");
  }

  if (!isActive(sessionRow.ACTIVE)) {
    throw new Error("Session is inactive.");
  }

  const expires = new Date(sessionRow.EXPIRES_AT);
  if (isNaN(expires.getTime()) || expires.getTime() <= Date.now()) {
    invalidateToken(token);
    throw new Error("Session expired. Please log in again.");
  }

  const user = findUserById(userId);
  if (!user) throw new Error("Session user no longer exists.");
  if (!isActive(user.ACTIVE)) throw new Error("Account is inactive.");

  const role = normalizeRole(user.ROLE);
  if (!role) throw new Error("Invalid role configured for this user.");

  return {
    user: user,
    role: role,
    token: token
  };
}

function findSession(token) {
  const rows = readSheetAsObjects(SHEETS.SESSIONS);
  return rows.find(r => String(r.TOKEN || "").trim() === String(token).trim()) || null;
}

function invalidateToken(token) {
  const sheet = getSheet(SHEETS.SESSIONS);
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(token)) {
      sheet.getRange(i + 1, 5).setValue(false);
      return;
    }
  }
}

function cleanupExpiredSessions() {
  const sheet = getSheet(SHEETS.SESSIONS);
  const rows = sheet.getDataRange().getValues();
  const now = Date.now();

  for (let i = 1; i < rows.length; i++) {
    const expires = new Date(rows[i][3]).getTime();
    if (expires && expires <= now) sheet.getRange(i + 1, 5).setValue(false);
  }
}

// ==================== MASTER DATA ====================

function getOfficeList(session) {
  authorize(session);

  const rows = readSheetAsObjects(SHEETS.OFFICE_MASTER);
  const active = rows.filter(r => isActive(r.ACTIVE));

  return successResponse(active.map(r => ({
    officeId: String(r.OFFICE_ID || "").trim(),
    officeName: String(r.OFFICE_NAME || "").trim(),
    division: String(r.DIVISION || "").trim()
  })));
}

function getUser(userId, session) {
  const auth = authorize(session);
  userId = String(userId || "").trim();

  if (auth.role === ROLES.SPM && userId !== auth.user.USER_ID) {
    throw new Error("Not authorized.");
  }

  const user = findUserById(userId);
  if (!user) return errorResponse("User not found.");

  return successResponse({
    userId: user.USER_ID,
    name: user.NAME,
    role: normalizeRole(user.ROLE),
    officeId: user.OFFICE_ID,
    officeName: getAuthoritativeOfficeName(user.OFFICE_ID, user.OFFICE_NAME)
  });
}

function findUserById(userId) {
  const rows = readSheetAsObjects(SHEETS.USER_MASTER);
  return rows.find(r => String(r.USER_ID || "").trim() === String(userId || "").trim()) || null;
}

function findOfficeById(officeId) {
  const rows = readSheetAsObjects(SHEETS.OFFICE_MASTER);
  return rows.find(r => String(r.OFFICE_ID || "").trim() === String(officeId || "").trim()) || null;
}

function getAuthoritativeOffice(officeId) {
  const office = findOfficeById(officeId);
  if (!office) throw new Error("Office not found in OFFICE_MASTER.");
  if (!isActive(office.ACTIVE)) throw new Error("Selected office is inactive.");
  return office;
}

function getAuthoritativeOfficeName(officeId, fallback) {
  const office = findOfficeById(officeId);
  return office ? String(office.OFFICE_NAME || "").trim() : String(fallback || "").trim();
}

function normalizeRole(role) {
  const value = String(role || "").trim().toUpperCase();
  return [ROLES.SPM, ROLES.DPS, ROLES.ADMIN].includes(value) ? value : "";
}

function isActive(value) {
  return value === true || String(value).trim().toUpperCase() === "TRUE" || String(value).trim() === "1";
}

// ==================== READS ====================

function getPreviousDay(officeId, date, session) {
  const auth = authorize(session);
  assertReadOfficeAccess(auth, officeId);

  const validDate = validateDateString(date);
  const prevDate = shiftDate(validDate, -1);
  const rows = dedupeDailyRows(readSheetAsObjects(SHEETS.DAILY_DATA));

  const record = rows.find(r =>
    String(r.OFFICE_ID) === String(officeId) &&
    normalizeSheetDate(r.DATE) === prevDate
  );

  if (!record) return successResponse(null);

  return successResponse({
    date: normalizeSheetDate(record.DATE),
    kitsCameToday: Number(record.KITS_CAME_TODAY) || 0,
    kitsDelivered: Number(record.KITS_DELIVERED) || 0,
    redirected: Number(record.REDIRECTED) || 0,
    currentPending: Number(record.CURRENT_PENDING) || 0
  });
}

function getHistory(officeId, from, to, session) {
  const auth = authorize(session);
  assertReadOfficeAccess(auth, officeId);

  if (from) validateDateString(from);
  if (to) validateDateString(to);

  const rows = dedupeDailyRows(readSheetAsObjects(SHEETS.DAILY_DATA));
  const filtered = rows.filter(r =>
    String(r.OFFICE_ID) === String(officeId) &&
    (!from || normalizeSheetDate(r.DATE) >= String(from)) &&
    (!to || normalizeSheetDate(r.DATE) <= String(to))
  ).sort((a, b) => String(a.DATE) < String(b.DATE) ? 1 : -1);

  return successResponse(filtered.map(r => ({
    date: normalizeSheetDate(r.DATE),
    kitsCameToday: Number(r.KITS_CAME_TODAY) || 0,
    kitsDelivered: Number(r.KITS_DELIVERED) || 0,
    redirected: Number(r.REDIRECTED) || 0,
    totalPending: Number(r.TOTAL_PENDING) || 0,
    deliveryPercentage: Number(r.DELIVERY_PERCENTAGE) || 0,
    status: r.STATUS
  })));
}

function getDashboardData(params, session) {
  const auth = authorize(session);
  if (![ROLES.DPS, ROLES.ADMIN].includes(auth.role)) {
    throw new Error("Only DPS/Admin users can access the dashboard.");
  }

  const from = params.from ? validateDateString(params.from) : shiftDate(todayISO(), -7);
  const to = params.to ? validateDateString(params.to) : todayISO();
  const officeFilter = String(params.officeId || "").trim();

  if (officeFilter) getAuthoritativeOffice(officeFilter);

  const rows = dedupeDailyRows(readSheetAsObjects(SHEETS.DAILY_DATA)).filter(r =>
    normalizeSheetDate(r.DATE) >= from &&
    normalizeSheetDate(r.DATE) <= to &&
    (!officeFilter || String(r.OFFICE_ID || "").trim() === officeFilter)
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

  kpis.deliveryPercent = kpis.totalCame > 0
    ? round1(kpis.totalDelivered / kpis.totalCame * 100)
    : 0;

  const officeMap = {};
  rows.forEach(r => {
    const key = String(r.OFFICE_ID);
    if (!officeMap[key]) {
      officeMap[key] = {
        officeId: key,
        officeName: String(r.OFFICE_NAME || getAuthoritativeOfficeName(key, "")),
        kitsCameToday: 0,
        kitsDelivered: 0,
        redirected: 0,
        totalPending: 0
      };
    }
    officeMap[key].kitsCameToday += Number(r.KITS_CAME_TODAY) || 0;
    officeMap[key].kitsDelivered += Number(r.KITS_DELIVERED) || 0;
    officeMap[key].redirected += Number(r.REDIRECTED) || 0;
    officeMap[key].totalPending += Number(r.TOTAL_PENDING) || 0;
  });

  const officeWise = Object.values(officeMap).map(o => ({
    ...o,
    deliveryPercentage: o.kitsCameToday > 0
      ? round1(o.kitsDelivered / o.kitsCameToday * 100)
      : 0
  }));

  const dateMap = {};
  rows.forEach(r => {
    const key = String(r.DATE);
    if (!dateMap[key]) {
      dateMap[key] = {
        date: key,
        kitsCameToday: 0,
        kitsDelivered: 0,
        redirected: 0,
        totalPending: 0
      };
    }
    dateMap[key].kitsCameToday += Number(r.KITS_CAME_TODAY) || 0;
    dateMap[key].kitsDelivered += Number(r.KITS_DELIVERED) || 0;
    dateMap[key].redirected += Number(r.REDIRECTED) || 0;
    dateMap[key].totalPending += Number(r.TOTAL_PENDING) || 0;
  });

  const dateWise = Object.values(dateMap)
    .map(d => ({
      ...d,
      deliveryPercentage: d.kitsCameToday > 0
        ? round1(d.kitsDelivered / d.kitsCameToday * 100)
        : 0
    }))
    .sort((a, b) => a.date > b.date ? 1 : -1);

  return successResponse({
    kpis,
    officeWise,
    dateWise,
    weeklyTrend: buildWeeklyTrend(dateWise)
  });
}

function assertReadOfficeAccess(auth, officeId) {
  const office = getAuthoritativeOffice(officeId);
  if (auth.role === ROLES.SPM && String(auth.user.OFFICE_ID) !== String(office.OFFICE_ID)) {
    throw new Error("Not authorized for this office.");
  }
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

// ==================== V5 ADMIN STATUS ====================

function getAdminTodayUpdateStatus(session, date) {
  const auth = authorize(session);
  if (![ROLES.ADMIN, ROLES.DPS].includes(auth.role)) {
    throw new Error("Only Admin/DPS users can access update status.");
  }

  const targetDate = validateDateString(date || todayISO());
  const users = readSheetAsObjects(SHEETS.USER_MASTER);
  const offices = readSheetAsObjects(SHEETS.OFFICE_MASTER);
  const records = dedupeDailyRows(readSheetAsObjects(SHEETS.DAILY_DATA));

  const activeSpms = users.filter(r =>
    isActive(r.ACTIVE) && normalizeRole(r.ROLE) === ROLES.SPM
  );
  const activeOffices = offices.filter(r => isActive(r.ACTIVE));

  const updated = new Set(
    records
      .filter(r => normalizeSheetDate(r.DATE) === targetDate)
      .map(r => String(r.SPM_ID || "").trim())
      .filter(Boolean)
  );

  const officeMap = {};
  activeOffices.forEach(o => {
    const id = String(o.OFFICE_ID || "").trim();
    if (!id) return;
    officeMap[id] = {
      officeId: id,
      officeName: String(o.OFFICE_NAME || "").trim(),
      totalSpms: 0,
      updatedSpms: 0,
      pendingSpms: 0
    };
  });

  const pendingSpms = [];
  activeSpms.forEach(u => {
    const spmId = String(u.USER_ID || "").trim();
    const officeId = String(u.OFFICE_ID || "").trim();
    const isUpdated = updated.has(spmId);

    if (!officeMap[officeId]) {
      officeMap[officeId] = {
        officeId: officeId,
        officeName: getAuthoritativeOfficeName(officeId, u.OFFICE_NAME),
        totalSpms: 0,
        updatedSpms: 0,
        pendingSpms: 0
      };
    }

    officeMap[officeId].totalSpms++;
    if (isUpdated) officeMap[officeId].updatedSpms++;
    else {
      officeMap[officeId].pendingSpms++;
      pendingSpms.push({
        spmId: spmId,
        spmName: String(u.NAME || "").trim(),
        officeId: officeId,
        officeName: getAuthoritativeOfficeName(officeId, u.OFFICE_NAME)
      });
    }
  });

  const officeWise = Object.values(officeMap).map(o => ({
    ...o,
    completionPercentage: o.totalSpms
      ? round1(o.updatedSpms / o.totalSpms * 100)
      : 0
  })).sort((a, b) => b.pendingSpms - a.pendingSpms || a.officeName.localeCompare(b.officeName));

  const totalSpms = activeSpms.length;
  const updatedCount = activeSpms.filter(u => updated.has(String(u.USER_ID || "").trim())).length;

  return successResponse({
    date: targetDate,
    spmsUpdatedToday: updatedCount,
    activeSpms: totalSpms,
    spmsPendingUpdate: totalSpms - updatedCount,
    completionPercentage: totalSpms ? round1(updatedCount / totalSpms * 100) : 0,
    officeWise: officeWise,
    pendingSpms: pendingSpms.sort((a, b) =>
      a.officeName.localeCompare(b.officeName) || a.spmName.localeCompare(b.spmName)
    )
  });
}

// ==================== WRITES ====================

function submitDailyRecord(record, session) {
  const auth = authorize(session);
  const user = auth.user;

  if (!record || typeof record !== "object") return errorResponse("Record is required.");

  const normalized = normalizeRecord(record);

  if (auth.role === ROLES.SPM &&
      String(user.OFFICE_ID) !== String(normalized.officeId)) {
    auditDenied(user, auth.role, normalized, "OFFICE_MISMATCH");
    return errorResponse("You are not authorized to submit data for this office.");
  }

  const office = getAuthoritativeOffice(normalized.officeId);
  normalized.officeName = String(office.OFFICE_NAME || "").trim();
  normalized.spmId = user.USER_ID;
  normalized.spmName = user.NAME;

  const validation = validateRecordServerSide(normalized);
  if (!validation.valid) {
    return { success: false, code: "VALIDATION", message: validation.errors[0], errors: validation.errors };
  }

  // TRUE idempotency: same client record ID is already stored => success.
  const byId = findDailyRecordById(normalized.id);
  if (byId) {
    return successResponse({
      recordId: normalized.id,
      alreadyProcessed: true
    }, "Record already synchronized.");
  }

  // BUSINESS RULE: one finalized submission per SPM per date.
  // Office is NOT the uniqueness key because several SPMs may belong to one office.
  const existing = findDailyRecordBySpmAndDate(normalized.spmId, normalized.date);
  if (existing) {
    return {
      success: false,
      code: "DUPLICATE",
      message: "You have already submitted data for this date."
    };
  }

  const totals = computeServerTotals(normalized);
  const lifecycle = computePendingLifecycleFromServer(normalized);

  const rowValues = buildDailyDataRow(normalized, totals, lifecycle, user);
  const sheet = getSheet(SHEETS.DAILY_DATA);

  const existingForSpmDate = findDailyRecordBySpmAndDate(normalized.spmId, normalized.date);
  if (existingForSpmDate) {
    return errorResponse(
      "You have already submitted data for this date. Use Edit or Delete Today's Entry.",
      [], "DUPLICATE"
    );
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  const existingInsideLock = findDailyRecordBySpmAndDate(normalized.spmId, normalized.date);
  if (existingInsideLock) {
    lock.releaseLock();
    return errorResponse(
      "You have already submitted data for this date. Use Edit or Delete Today's Entry.",
      [], "DUPLICATE"
    );
  }


  try {
    // Re-check inside the lock to prevent two simultaneous submissions.
    const duplicateInsideLock = findDailyRecordBySpmAndDate(
      normalized.spmId,
      normalized.date
    );
    const idInsideLock = findDailyRecordById(normalized.id);

    if (idInsideLock) {
      return successResponse({ recordId: normalized.id, alreadyProcessed: true }, "Record already synchronized.");
    }

    if (duplicateInsideLock) {
      return {
        success: false,
        code: "DUPLICATE",
        message: "You have already submitted data for this date."
      };
    }

    sheet.appendRow(rowValues);
    writeSetTrackerRows(normalized, user);
  } finally {
    lock.releaseLock();
  }

  logAudit(auditEntry(user, "CREATE", normalized, "", "SUCCESS"));

  return successResponse({ recordId: normalized.id }, "Record saved successfully.");
}

function syncOfflineRecord(record, session) {
  // Same secure path as submit, but same record.id is explicitly idempotent.
  return submitDailyRecord(record, session);
}

function updateDailyRecord(record, session) {
  const auth = authorize(session);

  if (![ROLES.DPS, ROLES.ADMIN].includes(auth.role)) {
    return errorResponse("Only DPS/Admin users can edit finalized records.");
  }

  if (!record || !record.id) {
    return errorResponse("Record ID is required for an edit.");
  }

  const existing = findDailyRecordById(record.id);
  if (!existing) {
    return errorResponse("The record to edit was not found.");
  }

  const normalized = normalizeRecord(record);
  const office = getAuthoritativeOffice(normalized.officeId);
  normalized.officeName = String(office.OFFICE_NAME || "").trim();

  const validation = validateRecordServerSide(normalized);
  if (!validation.valid) {
    return { success: false, code: "VALIDATION", message: validation.errors[0], errors: validation.errors };
  }

  // Business uniqueness remains SPM_ID + DATE, including edits.
  const duplicate = findDailyRecordBySpmAndDate(auth.user.USER_ID, normalized.date);
  if (duplicate && duplicate.__row !== existing.__row) {
    return {
      success: false,
      code: "DUPLICATE",
      message: "Another submission already exists for this SPM and date."
    };
  }

  normalized.spmId = auth.user.USER_ID;
  normalized.spmName = auth.user.NAME;

  const totals = computeServerTotals(normalized);
  const lifecycle = computePendingLifecycleFromServer(normalized);
  const rowValues = buildDailyDataRow(normalized, totals, lifecycle, auth.user);

  const sheet = getSheet(SHEETS.DAILY_DATA);
  sheet.getRange(existing.__row, 1, 1, rowValues.length).setValues([rowValues]);

  logAudit(auditEntry(auth.user, "UPDATE", normalized, JSON.stringify(existing), "SUCCESS"));

  return successResponse({ recordId: normalized.id }, "Record updated successfully.");
}

// ==================== VALIDATION / CALCULATIONS ====================

function normalizeRecord(record) {
  const r = JSON.parse(JSON.stringify(record || {}));

  r.id = String(r.id || "").trim();
  r.date = String(r.date || "").trim();
  r.officeId = String(r.officeId || "").trim();
  r.spmId = String(r.spmId || "").trim();
  r.spmName = String(r.spmName || "").trim();

  [
    "kitsCameToday",
    "kitsDelivered",
    "redirected",
    "mobileInvalid",
    "addressNotFound",
    "torn"
  ].forEach(k => {
    r[k] = r[k] === "" || r[k] === null || r[k] === undefined ? 0 : Number(r[k]);
  });

  r.incompleteRows = Array.isArray(r.incompleteRows) ? r.incompleteRows.map(x => ({
    setNumber: x.setNumber === "" || x.setNumber === undefined ? "" : Number(x.setNumber),
    kitsIncomplete: x.kitsIncomplete === "" || x.kitsIncomplete === undefined ? 0 : Number(x.kitsIncomplete)
  })) : [];

  r.completeRows = Array.isArray(r.completeRows) ? r.completeRows.map(x => ({
    setNumber: x.setNumber === "" || x.setNumber === undefined ? "" : Number(x.setNumber),
    kitsComplete: x.kitsComplete === "" || x.kitsComplete === undefined ? 0 : Number(x.kitsComplete)
  })) : [];

  return r;
}

function validateRecordServerSide(record) {
  const errors = [];

  if (!record.id) errors.push("Record ID is required.");
  if (!record.officeId) errors.push("Office is required.");
  if (!record.date) errors.push("Date is required.");

  if (record.date) {
    try {
      const validDate = validateDateString(record.date);
      if (validDate > todayISO()) errors.push("Future dates are not allowed.");
    } catch (e) {
      errors.push(e.message);
    }
  }

  const requiredNumeric = [
    "kitsCameToday",
    "kitsDelivered",
    "redirected",
    "mobileInvalid",
    "addressNotFound",
    "torn"
  ];

  requiredNumeric.forEach(field => {
    if (!isNonNegInt(record[field])) {
      errors.push(field + " must be a whole number that is zero or greater.");
    }
  });

  validateSetRows(record.incompleteRows, "kitsIncomplete", "Incomplete", errors);
  validateSetRows(record.completeRows, "kitsComplete", "Complete", errors);

  const totals = computeServerTotals(record);

  if (totals.kitsDelivered + totals.redirected + totals.totalPending > record.kitsCameToday) {
    errors.push(
      "Delivered + Redirected + Pending cannot exceed Kits Came Today."
    );
  }

  return { valid: errors.length === 0, errors: errors };
}

function validateSetRows(rows, qtyKey, label, errors) {
  rows.forEach((row, i) => {
    if (row.setNumber !== "" && !isNonNegInt(row.setNumber)) {
      errors.push(label + " Set row " + (i + 1) + ": Set number must be a whole number.");
    }

    if (!isNonNegInt(row[qtyKey])) {
      errors.push(label + " Set row " + (i + 1) + ": quantity must be a whole number.");
    }
  });
}

function computeServerTotals(record) {
  const kitsIncomplete = (record.incompleteRows || [])
    .reduce((sum, r) => sum + (Number(r.kitsIncomplete) || 0), 0);

  const kitsComplete = (record.completeRows || [])
    .reduce((sum, r) => sum + (Number(r.kitsComplete) || 0), 0);

  const totalPending =
    (Number(record.mobileInvalid) || 0) +
    (Number(record.addressNotFound) || 0) +
    (Number(record.torn) || 0) +
    kitsIncomplete +
    kitsComplete;

  const deliveryPercentage = Number(record.kitsCameToday) > 0
    ? round1(Number(record.kitsDelivered) / Number(record.kitsCameToday) * 100)
    : 0;

  return {
    kitsIncomplete,
    kitsComplete,
    totalPending,
    deliveryPercentage
  };
}

/**
 * The frontend's previousCurrentPending value is NOT trusted.
 * We read the previous calendar day's finalized record from the sheet.
 *
 * There is currently no "resolved pending" field in the SPM form, so
 * RESOLVED_PENDING is intentionally zero. If a resolution workflow is added,
 * this function should be extended server-side.
 */
function computePendingLifecycleFromServer(record) {
  const previousDate = shiftDate(record.date, -1);
  const rows = dedupeDailyRows(readSheetAsObjects(SHEETS.DAILY_DATA));

  const previous = rows.find(r =>
    String(r.OFFICE_ID) === String(record.officeId) &&
    normalizeSheetDate(r.DATE) === previousDate
  );

  const previousPending = previous ? Number(previous.CURRENT_PENDING) || 0 : 0;
  const totals = computeServerTotals(record);
  const resolvedPending = 0;
  const currentPending = Math.max(0, previousPending + totals.totalPending - resolvedPending);

  return {
    previousPending,
    newPending: totals.totalPending,
    resolvedPending,
    currentPending
  };
}

// ==================== SHEET ROWS ====================

function buildDailyDataRow(record, totals, lifecycle, user) {
  const now = new Date();

  return [
    record.id,
    record.date,
    record.officeId,
    record.officeName,
    user.USER_ID,
    user.NAME,
    Number(record.kitsCameToday) || 0,
    Number(record.kitsDelivered) || 0,
    Number(record.redirected) || 0,
    Number(record.mobileInvalid) || 0,
    Number(record.addressNotFound) || 0,
    Number(record.torn) || 0,
    countNonEmptySetRows(record.incompleteRows),
    totals.kitsIncomplete,
    countNonEmptySetRows(record.completeRows),
    totals.kitsComplete,
    totals.totalPending,
    totals.deliveryPercentage,
    lifecycle.previousPending,
    lifecycle.newPending,
    lifecycle.resolvedPending,
    lifecycle.currentPending,
    record.submittedAt ? new Date(record.submittedAt) : now,
    now,
    "FINAL"
  ];
}

function countNonEmptySetRows(rows) {
  return (rows || []).filter(r =>
    r.setNumber !== "" ||
    Number(r.kitsIncomplete || r.kitsComplete || 0) > 0
  ).length;
}

function normalizeSheetDate(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone() || "Asia/Kolkata",
      "yyyy-MM-dd"
    );
  }

  const s = String(value == null ? "" : value).trim();
  if (!s) return "";

  // Already normalized.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // Handle common Google Sheets date strings safely.
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(
      parsed,
      Session.getScriptTimeZone() || "Asia/Kolkata",
      "yyyy-MM-dd"
    );
  }

  return s;
}

function rowSortTimestamp(row) {
  const value = row.UPDATED_AT || row.SUBMITTED_AT || "";
  if (value instanceof Date && !isNaN(value.getTime())) return value.getTime();
  const parsed = new Date(value);
  if (!isNaN(parsed.getTime())) return parsed.getTime();
  return 0;
}

/**
 * Safely handles historical duplicate rows without deleting or altering them.
 * The uniqueness key is SPM_ID + DATE. If duplicates already exist, the
 * newest row (UPDATED_AT/SUBMITTED_AT, then sheet row) is used for reads and
 * calculations. The original rows remain untouched for audit purposes.
 */
function dedupeDailyRows(rows) {
  const map = {};

  (rows || []).forEach(row => {
    const spmId = String(row.SPM_ID || "").trim();
    const date = normalizeSheetDate(row.DATE);

    if (!spmId || !date) return;

    const key = spmId + "|" + date;
    const current = map[key];

    if (!current ||
        rowSortTimestamp(row) > rowSortTimestamp(current) ||
        (rowSortTimestamp(row) === rowSortTimestamp(current) && Number(row.__row || 0) > Number(current.__row || 0))) {
      map[key] = row;
    }
  });

  return Object.values(map);
}

function findDailyRecord(officeId, date) {
  const targetDate = normalizeSheetDate(date);
  const rows = readSheetAsObjects(SHEETS.DAILY_DATA);
  const found = dedupeDailyRows(rows).find(r =>
    String(r.OFFICE_ID || "").trim() === String(officeId || "").trim() &&
    normalizeSheetDate(r.DATE) === targetDate
  );
  return found || null;
}

function findDailyRecordBySpmAndDate(spmId, date) {
  const targetDate = normalizeSheetDate(date);
  const targetSpm = String(spmId || "").trim();
  const rows = readSheetAsObjects(SHEETS.DAILY_DATA);

  // Any existing duplicate is considered a duplicate submission. We do not
  // delete old rows; the newest row is returned for safe read/edit behavior.
  const matches = rows.filter(r =>
    String(r.SPM_ID || "").trim() === targetSpm &&
    normalizeSheetDate(r.DATE) === targetDate
  );

  if (!matches.length) return null;

  return matches.sort((a, b) =>
    rowSortTimestamp(b) - rowSortTimestamp(a) ||
    Number(b.__row || 0) - Number(a.__row || 0)
  )[0];
}

function findDailyRecordById(id) {
  const target = String(id || "").trim();
  if (!target) return null;

  const rows = readSheetAsObjects(SHEETS.DAILY_DATA);
  return rows.find(r => String(r.ID || "").trim() === target) || null;
}

/**
 * Diagnostic-only helper. It NEVER deletes or modifies DAILY_DATA.
 * Run manually from Apps Script to inspect legacy duplicates.
 */
function diagnoseDailyDataDuplicates() {
  const rows = readSheetAsObjects(SHEETS.DAILY_DATA);
  const groups = {};

  rows.forEach(r => {
    const spmId = String(r.SPM_ID || "").trim();
    const date = normalizeSheetDate(r.DATE);
    if (!spmId || !date) return;

    const key = spmId + "|" + date;
    if (!groups[key]) groups[key] = [];

    groups[key].push({
      row: r.__row,
      recordId: String(r.ID || ""),
      spmId: spmId,
      spmName: String(r.SPM_NAME || ""),
      date: date,
      officeId: String(r.OFFICE_ID || ""),
      updatedAt: r.UPDATED_AT || "",
      status: String(r.STATUS || "")
    });
  });

  const duplicates = Object.keys(groups)
    .filter(k => groups[k].length > 1)
    .map(k => ({
      key: k,
      count: groups[k].length,
      rows: groups[k]
    }));

  Logger.log(JSON.stringify({
    totalRows: rows.length,
    duplicateGroups: duplicates.length,
    duplicateRows: duplicates.reduce((n, g) => n + g.count - 1, 0),
    duplicates: duplicates
  }, null, 2));

  return {
    success: true,
    totalRows: rows.length,
    duplicateGroups: duplicates.length,
    duplicateRows: duplicates.reduce((n, g) => n + g.count - 1, 0),
    duplicates: duplicates
  };
}
function writeSetTrackerRows(record, user) {
  const rows = [];
  const timestamp = new Date();

  (record.incompleteRows || []).forEach(r => {
    if (r.setNumber !== "" || Number(r.kitsIncomplete) > 0) {
      rows.push([
        timestamp,
        record.date,
        record.officeId,
        "INCOMPLETE",
        r.setNumber,
        Number(r.kitsIncomplete) || 0,
        user.USER_ID
      ]);
    }
  });

  (record.completeRows || []).forEach(r => {
    if (r.setNumber !== "" || Number(r.kitsComplete) > 0) {
      rows.push([
        timestamp,
        record.date,
        record.officeId,
        "COMPLETE",
        r.setNumber,
        Number(r.kitsComplete) || 0,
        user.USER_ID
      ]);
    }
  });

  if (!rows.length) return;

  const sheet = getSheet(SHEETS.SET_TRACKER);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

// ==================== AUDIT ====================

function auditEntry(user, action, record, oldValue, result) {
  return {
    userId: user.USER_ID,
    userName: user.NAME,
    role: normalizeRole(user.ROLE),
    action: action,
    recordId: record.id || "",
    officeId: record.officeId || "",
    date: record.date || "",
    oldValue: oldValue || "",
    newValue: "",
    requestInfo: "",
    result: result
  };
}

function auditDenied(user, role, record, reason) {
  logAudit({
    userId: user.USER_ID,
    userName: user.NAME,
    role: role,
    action: "DENIED",
    recordId: record.id || "",
    officeId: record.officeId || "",
    date: record.date || "",
    oldValue: "",
    newValue: "",
    requestInfo: reason,
    result: "DENIED"
  });
}

function logAudit(entry) {
  try {
    const sheet = getSheet(SHEETS.AUDIT_LOG);
    sheet.appendRow([
      new Date(),
      entry.userId || "",
      entry.userName || "",
      entry.role || "",
      entry.action || "",
      entry.recordId || "",
      entry.officeId || "",
      entry.date || "",
      entry.oldValue || "",
      entry.newValue || "",
      entry.requestInfo || "",
      entry.result || ""
    ]);
  } catch (e) {
    // Audit failure must not silently destroy an otherwise successful data write.
    console.error(e);
  }
}

// ==================== HELPERS ====================

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheet(name) {
  const sheet = getSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error("Sheet not found: " + name);
  return sheet;
}

function readSheetAsObjects(name) {
  const sheet = getSheet(name);
  const data = sheet.getDataRange().getValues();

  if (data.length < 2) return [];

  const headers = data[0];
  return data.slice(1)
    .filter(row => row.join("") !== "")
    .map((row, index) => {
      const obj = { __row: index + 2 };
      headers.forEach((h, i) => obj[h] = row[i]);
      return obj;
    });
}

function sumField(rows, field) {
  return rows.reduce((sum, row) => sum + (Number(row[field]) || 0), 0);
}

function shiftDate(dateStr, days) {
  const d = new Date(validateDateString(dateStr) + "T00:00:00");
  d.setDate(d.getDate() + days);
  return Utilities.formatDate(
    d,
    Session.getScriptTimeZone() || "Asia/Kolkata",
    "yyyy-MM-dd"
  );
}

function todayISO() {
  return Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone() || "Asia/Kolkata",
    "yyyy-MM-dd"
  );
}

function validateDateString(value) {
  const s = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error("Date must be in YYYY-MM-DD format.");
  }

  const d = new Date(s + "T00:00:00");
  if (isNaN(d.getTime())) throw new Error("Invalid date.");

  const normalized = Utilities.formatDate(
    d,
    Session.getScriptTimeZone() || "Asia/Kolkata",
    "yyyy-MM-dd"
  );

  if (normalized !== s) throw new Error("Invalid date.");
  return s;
}

function isNonNegInt(value) {
  if (typeof value === "number") return Number.isInteger(value) && value >= 0;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return true;
  return false;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function buildRecordId(record) {
  return String(record.date) + "_" + String(record.officeId) + "_" + Utilities.getUuid();
}

function successResponse(data, message) {
  return {
    success: true,
    message: message || "OK",
    data: data
  };
}

function errorResponse(message, errors, code) {
  return {
    success: false,
    code: code || undefined,
    message: message || "Request failed.",
    errors: errors || []
  };
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==================== ONE-TIME SETUP ====================

function setupSheets() {
  const ss = getSpreadsheet();

  createSheetIfMissing(ss, SHEETS.DAILY_DATA, [
    "ID", "DATE", "OFFICE_ID", "OFFICE_NAME", "SPM_ID", "SPM_NAME",
    "KITS_CAME_TODAY", "KITS_DELIVERED", "REDIRECTED",
    "MOBILE_NUMBER_INVALID", "ADDRESS_NOT_FOUND", "TORN_CONDITION",
    "INCOMPLETE_SET_NUMBER", "KITS_INCOMPLETE",
    "COMPLETE_SET_NUMBER", "KITS_COMPLETE",
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

  createSheetIfMissing(ss, SHEETS.SESSIONS, [
    "TOKEN", "USER_ID", "CREATED_AT", "EXPIRES_AT", "ACTIVE"
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
