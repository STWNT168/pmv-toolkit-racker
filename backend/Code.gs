const SPREADSHEET_ID = "1vEjY1z-147b38XTWV7vRm_9pjXVMfJmjdQtrKRkkLy8";
const SHEETS = {
  DAILY_DATA: "DAILY_DATA",
  OFFICE_MASTER: "OFFICE_MASTER",
  USER_MASTER: "USER_MASTER",
  SET_TRACKER: "SET_TRACKER",
  AUDIT_LOG: "AUDIT_LOG",
  SESSIONS: "SESSIONS"
};
const ROLES = { SPM: "SPM", DPS: "DPS", ADMIN: "ADMIN" };
const SESSION_DAYS = 7;

function doGet(e) {
  try {
    const p = e && e.parameter ? e.parameter : {};
    const action = p.action;
    const session = needsSession(p.session);
    switch (action) {
      case "getOfficeList": return out(getOfficeList(session));
      case "getUser": return out(getUser(p.userId, session));
      case "getPreviousDay": return out(getPreviousDay(p.officeId, p.date, session));
      case "getOwnTodayRecord": return out(getOwnTodayRecord(session));
      case "getAdminTodayUpdateStatus": return out(getAdminTodayUpdateStatus(session, p.date || todayISO()));
      default: return out(err("Unknown GET action."));
    }
  } catch (x) {
    return out(err(x.message || String(x)));
  }
}

function doPost(e) {
  try {
    const b = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    switch (b.action) {
      case "login": return out(login(b.userId, b.mobile));
      case "logout": return out(logout(b.session));
      case "submitDailyRecord": return out(submitDailyRecord(b.record, b.session));
      case "syncOfflineRecord": return out(submitDailyRecord(b.record, b.session));
      case "updateDailyRecord": return out(updateDailyRecord(b.record, b.session));
      case "deleteOwnTodayRecord": return out(deleteOwnTodayRecord(b.session, b.recordId));
      default: return out(err("Unknown POST action."));
    }
  } catch (x) {
    return out(err(x.message || String(x)));
  }
}

function login(userId, mobile) {
  const u = findUser(userId);
  if (!u) return err("User not found.");
  if (String(u.MOBILE).trim() !== String(mobile).trim()) return err("Mobile number does not match our records.");
  if (!active(u.ACTIVE)) return err("This account is inactive.");
  const role = normRole(u.ROLE);
  if (!role) return err("Invalid role.");

  const token = Utilities.getUuid() + "-" + Utilities.getUuid();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86400000);
  getSheet(SHEETS.SESSIONS).appendRow([token, u.USER_ID, now, expires, true]);

  return ok({
    userId: String(u.USER_ID),
    name: String(u.NAME || ""),
    role: role,
    officeId: String(u.OFFICE_ID || ""),
    officeName: officeName(u.OFFICE_ID, u.OFFICE_NAME),
    token: token,
    expiresAt: expires.toISOString()
  }, "Login successful.");
}

function logout(s) {
  auth(s);
  const sh = getSheet(SHEETS.SESSIONS);
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(s.token)) {
      sh.getRange(i + 1, 5).setValue(false);
      break;
    }
  }
  return ok(null, "Logged out.");
}

function needsSession(raw) {
  if (!raw) throw new Error("Not authenticated.");
  try { return JSON.parse(raw); }
  catch (_) { throw new Error("Invalid session."); }
}

function auth(s) {
  if (!s || !s.userId || !s.token) throw new Error("Not authenticated.");

  const r = read(SHEETS.SESSIONS).find(x =>
    String(x.TOKEN).trim() === String(s.token).trim() &&
    String(x.USER_ID).trim() === String(s.userId).trim()
  );

  if (!r || !active(r.ACTIVE)) throw new Error("Session expired or invalid.");

  if (new Date(r.EXPIRES_AT).getTime() <= Date.now()) {
    invalidate(s.token);
    throw new Error("Session expired. Please log in again.");
  }

  const u = findUser(s.userId);
  if (!u || !active(u.ACTIVE)) throw new Error("Account is inactive.");

  const role = normRole(u.ROLE);
  if (!role) throw new Error("Invalid role.");

  return { user: u, role: role, token: s.token };
}

function findUser(id) {
  return read(SHEETS.USER_MASTER).find(r =>
    String(r.USER_ID).trim() === String(id || "").trim()
  ) || null;
}

function getOfficeList(s) {
  auth(s);
  return ok(read(SHEETS.OFFICE_MASTER)
    .filter(r => active(r.ACTIVE))
    .map(r => ({
      officeId: String(r.OFFICE_ID || ""),
      officeName: String(r.OFFICE_NAME || ""),
      division: String(r.DIVISION || "")
    })));
}

function getUser(id, s) {
  const a = auth(s);
  if (a.role === ROLES.SPM && String(id) !== String(a.user.USER_ID)) {
    throw new Error("Not authorized.");
  }

  const u = findUser(id);
  if (!u) return err("User not found.");

  return ok({
    userId: String(u.USER_ID || ""),
    name: String(u.NAME || ""),
    role: normRole(u.ROLE),
    officeId: String(u.OFFICE_ID || ""),
    officeName: officeName(u.OFFICE_ID, u.OFFICE_NAME)
  });
}

function getPreviousDay(officeId, date, s) {
  const a = auth(s);
  assertOffice(a, officeId);

  const d = validateDate(date);
  const prev = shift(d, -1);
  const r = dedupe().find(x =>
    String(x.OFFICE_ID) === String(officeId) && dateOf(x.DATE) === prev
  );

  return ok(r ? {
    date: prev,
    kitsCameToday: num(r.KITS_CAME_TODAY),
    kitsDelivered: num(r.KITS_DELIVERED),
    redirected: num(r.REDIRECTED),
    currentPending: num(r.CURRENT_PENDING)
  } : null);
}

function getOwnTodayRecord(s) {
  const a = auth(s);
  if (a.role !== ROLES.SPM) throw new Error("Only SPM users can access this function.");

  const rs = read(SHEETS.DAILY_DATA)
    .filter(r =>
      String(r.SPM_ID).trim() === String(a.user.USER_ID).trim() &&
      dateOf(r.DATE) === todayISO()
    )
    .sort((x, y) => Number(y.__row) - Number(x.__row));

  return ok(rs.length ? mapRecord(rs[0]) : null);
}

function getAdminTodayUpdateStatus(s, date) {
  const a = auth(s);
  if (a.role !== ROLES.DPS && a.role !== ROLES.ADMIN) {
    throw new Error("Only DPS/Admin users can access update status.");
  }

  const d = validateDate(date);
  const users = read(SHEETS.USER_MASTER)
    .filter(u => active(u.ACTIVE) && normRole(u.ROLE) === ROLES.SPM);

  // Logical deduplication: dashboard counts only one record per SPM/date.
  const recs = dedupe().filter(r => dateOf(r.DATE) === d);
  const updated = {};
  recs.forEach(r => updated[String(r.SPM_ID).trim()] = true);

  const officeMap = {};
  read(SHEETS.OFFICE_MASTER).filter(o => active(o.ACTIVE)).forEach(o => {
    officeMap[String(o.OFFICE_ID)] = {
      officeId: String(o.OFFICE_ID),
      officeName: String(o.OFFICE_NAME || ""),
      totalSpms: 0,
      updatedSpms: 0,
      pendingSpms: 0,
      kitsCameToday: 0,
      kitsDelivered: 0,
      redirected: 0,
      mobileInvalid: 0,
      addressNotFound: 0,
      torn: 0,
      kitsIncomplete: 0,
      kitsComplete: 0,
      totalPending: 0,
      deliveryPercentage: 0,
      completionPercentage: 0
    };
  });

  const pending = [];
  const done = [];

  users.forEach(u => {
    const uid = String(u.USER_ID);
    const oid = String(u.OFFICE_ID);

    if (!officeMap[oid]) {
      officeMap[oid] = {
        officeId: oid,
        officeName: officeName(oid, u.OFFICE_NAME),
        totalSpms: 0, updatedSpms: 0, pendingSpms: 0,
        kitsCameToday: 0, kitsDelivered: 0, redirected: 0,
        mobileInvalid: 0, addressNotFound: 0, torn: 0,
        kitsIncomplete: 0, kitsComplete: 0, totalPending: 0,
        deliveryPercentage: 0, completionPercentage: 0
      };
    }

    officeMap[oid].totalSpms++;

    if (updated[uid]) {
      officeMap[oid].updatedSpms++;
      done.push({
        spmId: uid,
        spmName: String(u.NAME || ""),
        officeId: oid,
        officeName: officeMap[oid].officeName
      });
    } else {
      officeMap[oid].pendingSpms++;
      pending.push({
        spmId: uid,
        spmName: String(u.NAME || ""),
        officeId: oid,
        officeName: officeMap[oid].officeName
      });
    }
  });

  recs.forEach(r => {
    const oid = String(r.OFFICE_ID);

    if (!officeMap[oid]) {
      officeMap[oid] = {
        officeId: oid,
        officeName: String(r.OFFICE_NAME || ""),
        totalSpms: 0, updatedSpms: 0, pendingSpms: 0,
        kitsCameToday: 0, kitsDelivered: 0, redirected: 0,
        mobileInvalid: 0, addressNotFound: 0, torn: 0,
        kitsIncomplete: 0, kitsComplete: 0, totalPending: 0,
        deliveryPercentage: 0, completionPercentage: 0
      };
    }

    const o = officeMap[oid];
    o.kitsCameToday += num(r.KITS_CAME_TODAY);
    o.kitsDelivered += num(r.KITS_DELIVERED);
    o.redirected += num(r.REDIRECTED);
    o.mobileInvalid += num(r.MOBILE_NUMBER_INVALID);
    o.addressNotFound += num(r.ADDRESS_NOT_FOUND);
    o.torn += num(r.TORN_CONDITION);
    o.kitsIncomplete += num(r.KITS_INCOMPLETE);
    o.kitsComplete += num(r.KITS_COMPLETE);
    o.totalPending += num(r.TOTAL_PENDING);
  });

  Object.keys(officeMap).forEach(oid => {
    const o = officeMap[oid];
    o.completionPercentage = o.totalSpms
      ? round(o.updatedSpms / o.totalSpms * 100) : 0;
    o.deliveryPercentage = o.kitsCameToday
      ? round(o.kitsDelivered / o.kitsCameToday * 100) : 0;
  });

  const detailedSpmData = users.map(u => {
    const r = recs.find(x =>
      String(x.SPM_ID).trim() === String(u.USER_ID).trim()
    );

    return r ? {
      officeName: String(r.OFFICE_NAME || ""),
      spmName: String(r.SPM_NAME || u.NAME || ""),
      spmId: String(r.SPM_ID || u.USER_ID),
      status: "Updated",
      kitsCameToday: num(r.KITS_CAME_TODAY),
      kitsDelivered: num(r.KITS_DELIVERED),
      redirected: num(r.REDIRECTED),
      mobileInvalid: num(r.MOBILE_NUMBER_INVALID),
      addressNotFound: num(r.ADDRESS_NOT_FOUND),
      torn: num(r.TORN_CONDITION),
      kitsIncomplete: num(r.KITS_INCOMPLETE),
      kitsComplete: num(r.KITS_COMPLETE),
      totalPending: num(r.TOTAL_PENDING),
      deliveryPercentage: num(r.DELIVERY_PERCENTAGE)
    } : {
      officeName: officeName(u.OFFICE_ID, u.OFFICE_NAME),
      spmName: String(u.NAME || ""),
      spmId: String(u.USER_ID || ""),
      status: "Not updated",
      kitsCameToday: 0, kitsDelivered: 0, redirected: 0,
      mobileInvalid: 0, addressNotFound: 0, torn: 0,
      kitsIncomplete: 0, kitsComplete: 0, totalPending: 0,
      deliveryPercentage: 0
    };
  });

  const total = users.length;
  const updatedCount = done.length;

  return ok({
    date: d,
    spmsUpdatedToday: updatedCount,
    activeSpms: total,
    spmsPendingUpdate: total - updatedCount,
    completionPercentage: total ? round(updatedCount / total * 100) : 0,
    officeWise: Object.keys(officeMap).map(k => officeMap[k]),
    updatedSpms: done,
    pendingSpms: pending,
    detailedSpmData: detailedSpmData
  });
}

function submitDailyRecord(record, s) {
  const a = auth(s);
  const r = normalize(record);

  if (a.role === ROLES.SPM &&
      String(a.user.OFFICE_ID) !== String(r.officeId)) {
    return err("You are not authorized to submit data for this office.", "FORBIDDEN");
  }

  const o = getOffice(r.officeId);
  r.officeName = String(o.OFFICE_NAME || "");
  r.spmId = String(a.user.USER_ID);
  r.spmName = String(a.user.NAME || "");

  const v = validateRecord(r);
  if (!v.valid) {
    return {success:false, code:"VALIDATION", message:v.errors[0], errors:v.errors};
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    // Atomic SPM + date duplicate protection.
    if (findById(r.id)) {
      return ok({recordId:r.id, alreadyProcessed:true}, "Record already synchronized.");
    }

    if (findBySpmDate(r.spmId, r.date)) {
      return {
        success:false,
        code:"DUPLICATE",
        message:"You have already submitted data for this date.",
        errors:[]
      };
    }

    const totals = totalsFor(r);
    const prev = previousPending(r);
    const currentPending = Math.max(0, prev + totals.totalPending);

    const row = [
      r.id, r.date, r.officeId, r.officeName, r.spmId, r.spmName,
      r.kitsCameToday, r.kitsDelivered, r.redirected, r.mobileInvalid,
      r.addressNotFound, r.torn, r.incompleteRows.length, totals.kitsIncomplete,
      r.completeRows.length, totals.kitsComplete, totals.totalPending,
      totals.deliveryPercentage, prev, totals.totalPending, 0, currentPending,
      new Date(r.submittedAt || Date.now()), new Date(), "FINAL"
    ];

    getSheet(SHEETS.DAILY_DATA).appendRow(row);
  } finally {
    lock.releaseLock();
  }

  return ok({recordId:r.id}, "Record saved successfully.");
}

function updateDailyRecord(record, s) {
  const a = auth(s);
  if (a.role !== ROLES.DPS && a.role !== ROLES.ADMIN) {
    return err("Only DPS/Admin users can edit finalized records.", "FORBIDDEN");
  }

  const ex = findById(record && record.id);
  if (!ex) return err("Record not found.", "NOT_FOUND");

  const r = normalize(record);
  r.officeId = String(ex.OFFICE_ID);
  r.officeName = String(ex.OFFICE_NAME);
  r.spmId = String(ex.SPM_ID);
  r.spmName = String(ex.SPM_NAME);

  const v = validateRecord(r);
  if (!v.valid) {
    return {success:false, code:"VALIDATION", message:v.errors[0], errors:v.errors};
  }

  const other = findBySpmDate(r.spmId, r.date);
  if (other && Number(other.__row) !== Number(ex.__row)) {
    return {
      success:false,
      code:"DUPLICATE",
      message:"Another submission already exists for this SPM and date.",
      errors:[]
    };
  }

  const t = totalsFor(r);
  const p = previousPending(r);
  const currentPending = Math.max(0, p + t.totalPending);

  const row = [
    r.id, r.date, r.officeId, r.officeName, r.spmId, r.spmName,
    r.kitsCameToday, r.kitsDelivered, r.redirected, r.mobileInvalid,
    r.addressNotFound, r.torn, r.incompleteRows.length, t.kitsIncomplete,
    r.completeRows.length, t.kitsComplete, t.totalPending, t.deliveryPercentage,
    p, t.totalPending, 0, currentPending, ex.SUBMITTED_AT, new Date(), "FINAL"
  ];

  getSheet(SHEETS.DAILY_DATA).getRange(ex.__row, 1, 1, row.length).setValues([row]);
  return ok({recordId:r.id}, "Record updated successfully.");
}

function deleteOwnTodayRecord(s, recordId) {
  const a = auth(s);
  if (a.role !== ROLES.SPM) {
    return err("Only SPM users can delete their own today's entry.", "FORBIDDEN");
  }

  const uid = String(a.user.USER_ID);
  const today = todayISO();
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const sh = getSheet(SHEETS.DAILY_DATA);
    const rows = read(SHEETS.DAILY_DATA)
      .filter(r =>
        String(r.SPM_ID).trim() === uid &&
        dateOf(r.DATE) === today
      )
      .sort((x,y) => Number(y.__row) - Number(x.__row));

    if (!rows.length) {
      return err("No entry for today was found.", "NOT_FOUND");
    }

    // Bottom-to-top prevents row shifting.
    rows.forEach(r => sh.deleteRow(Number(r.__row)));

    return ok({
      deleted:true,
      rowsDeleted:rows.length
    }, "Today's entry deleted.");
  } finally {
    lock.releaseLock();
  }
}

function normalize(r) {
  r = JSON.parse(JSON.stringify(r || {}));
  r.id = String(r.id || "").trim();
  r.date = String(r.date || "").trim();
  r.officeId = String(r.officeId || "").trim();

  ["kitsCameToday","kitsDelivered","redirected","mobileInvalid",
   "addressNotFound","torn"].forEach(k => {
    r[k] = r[k] === "" || r[k] == null ? 0 : Number(r[k]);
  });

  r.incompleteRows = Array.isArray(r.incompleteRows)
    ? r.incompleteRows.map(x => ({
        setNumber: x.setNumber === "" || x.setNumber == null ? "" : Number(x.setNumber),
        kitsIncomplete: x.kitsIncomplete === "" || x.kitsIncomplete == null ? 0 : Number(x.kitsIncomplete)
      }))
    : [];

  r.completeRows = Array.isArray(r.completeRows)
    ? r.completeRows.map(x => ({
        setNumber: x.setNumber === "" || x.setNumber == null ? "" : Number(x.setNumber),
        kitsComplete: x.kitsComplete === "" || x.kitsComplete == null ? 0 : Number(x.kitsComplete)
      }))
    : [];

  return r;
}

function validateRecord(r) {
  const e = [];

  if (!r.id) e.push("Record ID is required.");
  if (!r.date) e.push("Date is required.");
  else {
    try {
      if (validateDate(r.date) > todayISO()) e.push("Future dates are not allowed.");
    } catch (x) {
      e.push(x.message);
    }
  }

  if (!getOffice(r.officeId)) e.push("Office is invalid.");

  ["kitsCameToday","kitsDelivered","redirected","mobileInvalid",
   "addressNotFound","torn"].forEach(k => {
    if (!isInt(r[k])) e.push(k + " must be a non-negative integer.");
  });

  [[r.incompleteRows,"kitsIncomplete"],[r.completeRows,"kitsComplete"]]
    .forEach(pair => pair[0].forEach(x => {
      if (x.setNumber !== "" && !isInt(x.setNumber)) {
        e.push("Set number must be a non-negative integer.");
      }
      if (!isInt(x[pair[1]])) {
        e.push("Set quantity must be a non-negative integer.");
      }
    }));

  if (e.length) return {valid:false, errors:e};

  const t = totalsFor(r);
  if (r.kitsDelivered + r.redirected + t.totalPending > r.kitsCameToday) {
    e.push("Delivered + Redirected + Pending cannot exceed Kits Came Today.");
  }

  return {valid:!e.length, errors:e};
}

function totalsFor(r) {
  const incomplete = r.incompleteRows.reduce(
    (s,x) => s + (Number(x.kitsIncomplete) || 0), 0
  );
  const complete = r.completeRows.reduce(
    (s,x) => s + (Number(x.kitsComplete) || 0), 0
  );

  const pending = r.mobileInvalid + r.addressNotFound + r.torn +
    incomplete + complete;

  return {
    kitsIncomplete: incomplete,
    kitsComplete: complete,
    totalPending: pending,
    deliveryPercentage: r.kitsCameToday
      ? round(r.kitsDelivered / r.kitsCameToday * 100) : 0
  };
}

function previousPending(r) {
  const x = dedupe().find(z =>
    String(z.OFFICE_ID) === String(r.officeId) &&
    dateOf(z.DATE) === shift(r.date,-1)
  );
  return x ? num(x.CURRENT_PENDING) : 0;
}

// Logical deduplication for reads/dashboard.
// It does not delete physical rows.
function dedupe() {
  const m = {};

  read(SHEETS.DAILY_DATA).forEach(r => {
    const key = String(r.SPM_ID).trim() + "|" + dateOf(r.DATE);

    if (!m[key] || Number(r.__row) > Number(m[key].__row)) {
      m[key] = r;
    }
  });

  return Object.keys(m).map(k => m[k]);
}

function findById(id) {
  return read(SHEETS.DAILY_DATA).find(r =>
    String(r.ID).trim() === String(id || "").trim()
  ) || null;
}

function findBySpmDate(spm, date) {
  return read(SHEETS.DAILY_DATA).find(r =>
    String(r.SPM_ID).trim() === String(spm).trim() &&
    dateOf(r.DATE) === String(date)
  ) || null;
}

function mapRecord(r) {
  return {
    id:String(r.ID || ""),
    date:dateOf(r.DATE),
    officeId:String(r.OFFICE_ID || ""),
    officeName:String(r.OFFICE_NAME || ""),
    spmId:String(r.SPM_ID || ""),
    spmName:String(r.SPM_NAME || ""),
    kitsCameToday:num(r.KITS_CAME_TODAY),
    kitsDelivered:num(r.KITS_DELIVERED),
    redirected:num(r.REDIRECTED),
    totalPending:num(r.TOTAL_PENDING),
    deliveryPercentage:num(r.DELIVERY_PERCENTAGE),
    status:String(r.STATUS || "")
  };
}

function getOffice(id) {
  const o = read(SHEETS.OFFICE_MASTER).find(x =>
    String(x.OFFICE_ID).trim() === String(id).trim()
  );

  if (!o) throw new Error("Office not found in OFFICE_MASTER.");
  if (!active(o.ACTIVE)) throw new Error("Office is inactive.");
  return o;
}

function assertOffice(a,id) {
  const o = getOffice(id);

  if (a.role === ROLES.SPM &&
      String(a.user.OFFICE_ID) !== String(o.OFFICE_ID)) {
    throw new Error("Not authorized for this office.");
  }
}

function officeName(id,fallback) {
  const o = read(SHEETS.OFFICE_MASTER).find(x =>
    String(x.OFFICE_ID).trim() === String(id).trim()
  );
  return o ? String(o.OFFICE_NAME || "") : String(fallback || "");
}

function read(name) {
  const d = getSheet(name).getDataRange().getValues();
  if (d.length < 2) return [];

  const h = d[0].map(x => String(x).trim());

  return d.slice(1)
    .filter(r => r.join("") !== "")
    .map((r,i) => {
      const o = {__row:i+2};
      h.forEach((x,j) => o[x] = r[j]);
      return o;
    });
}

function getSheet(n) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const s = ss.getSheetByName(n);

  if (!s) {
    throw new Error(
      "Sheet not found: " + n + ". Run setupSheets() or create the required tab."
    );
  }

  return s;
}

function active(v) {
  return v === true ||
    ["TRUE","1","YES","Y"].includes(String(v).trim().toUpperCase());
}

function normRole(v) {
  v = String(v || "").trim().toUpperCase();
  return Object.values(ROLES).includes(v) ? v : "";
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isInt(v) {
  return Number.isInteger(v) && v >= 0;
}

function round(v) {
  return Math.round(v * 10) / 10;
}

function validateDate(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ""))) {
    throw new Error("Date must be in YYYY-MM-DD format.");
  }

  const d = new Date(v + "T00:00:00");
  if (isNaN(d.getTime())) throw new Error("Invalid date.");

  return String(v);
}

function dateOf(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(
      v,
      Session.getScriptTimeZone() || "Asia/Kolkata",
      "yyyy-MM-dd"
    );
  }

  const s = String(v || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const d = new Date(s);
  return isNaN(d.getTime()) ? s :
    Utilities.formatDate(
      d,
      Session.getScriptTimeZone() || "Asia/Kolkata",
      "yyyy-MM-dd"
    );
}

function shift(v,n) {
  const d = new Date(validateDate(v) + "T00:00:00");
  d.setDate(d.getDate() + n);

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

function invalidate(t) {
  const s = getSheet(SHEETS.SESSIONS);
  const r = s.getDataRange().getValues();

  for (let i=1; i<r.length; i++) {
    if (String(r[i][0]) === String(t)) {
      s.getRange(i+1,5).setValue(false);
      break;
    }
  }
}

function ok(data,message) {
  return {
    success:true,
    message:message || "OK",
    data:data
  };
}

function err(message,code) {
  return {
    success:false,
    code:code || undefined,
    message:message || "Request failed.",
    errors:[]
  };
}

function out(x) {
  return ContentService
    .createTextOutput(JSON.stringify(x))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Run once only if required tabs are missing.
 * Existing data is not overwritten.
 */
function setupSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  const defs = {
    DAILY_DATA:[
      "ID","DATE","OFFICE_ID","OFFICE_NAME","SPM_ID","SPM_NAME",
      "KITS_CAME_TODAY","KITS_DELIVERED","REDIRECTED",
      "MOBILE_NUMBER_INVALID","ADDRESS_NOT_FOUND","TORN_CONDITION",
      "INCOMPLETE_SET_NUMBER","KITS_INCOMPLETE",
      "COMPLETE_SET_NUMBER","KITS_COMPLETE","TOTAL_PENDING",
      "DELIVERY_PERCENTAGE","PREVIOUS_PENDING","NEW_PENDING",
      "RESOLVED_PENDING","CURRENT_PENDING","SUBMITTED_AT",
      "UPDATED_AT","STATUS"
    ],
    OFFICE_MASTER:[
      "OFFICE_ID","OFFICE_NAME","DIVISION","SPM_ID","SPM_NAME","ACTIVE"
    ],
    USER_MASTER:[
      "USER_ID","NAME","ROLE","OFFICE_ID","OFFICE_NAME","MOBILE","ACTIVE"
    ],
    SET_TRACKER:[
      "TIMESTAMP","DATE","OFFICE_ID","SET_TYPE","SET_NUMBER",
      "QUANTITY","ENTERED_BY"
    ],
    AUDIT_LOG:[
      "TIMESTAMP","USER_ID","USER_NAME","ROLE","ACTION",
      "RECORD_ID","OFFICE_ID","DATE","OLD_VALUE","NEW_VALUE",
      "REQUEST_INFO","RESULT"
    ],
    SESSIONS:[
      "TOKEN","USER_ID","CREATED_AT","EXPIRES_AT","ACTIVE"
    ]
  };

  Object.keys(defs).forEach(name => {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);

    if (sh.getLastRow() === 0) {
      sh.getRange(1,1,1,defs[name].length).setValues([defs[name]]);
    }
  });

  Logger.log("setupSheets completed for " + SPREADSHEET_ID);
}

/**
 * Physically removes duplicate DAILY_DATA rows for the same SPM + date.
 * Keeps the newest physical row and deletes older duplicates.
 * Run once to clean historical duplicates already in the sheet.
 */
function cleanupDuplicateDailyData() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const sh = getSheet(SHEETS.DAILY_DATA);
    const rows = read(SHEETS.DAILY_DATA);
    const keep = {};
    const duplicates = [];

    rows.forEach(r => {
      const key = String(r.SPM_ID).trim() + "|" + dateOf(r.DATE);

      if (!keep[key]) {
        keep[key] = r;
      } else if (Number(r.__row) > Number(keep[key].__row)) {
        duplicates.push(keep[key]);
        keep[key] = r;
      } else {
        duplicates.push(r);
      }
    });

    // Bottom-to-top deletion prevents row-number shifts.
    duplicates
      .sort((a,b) => Number(b.__row) - Number(a.__row))
      .forEach(r => sh.deleteRow(Number(r.__row)));

    Logger.log("Duplicate cleanup removed " + duplicates.length + " row(s).");

    return {
      success:true,
      deletedRows:duplicates.length
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Safe manual diagnostic. It does NOT require a website session.
 * Note: DAILY_RECORDS is not required by this V5.0.6 backend;
 * the live data sheet is DAILY_DATA.
 */
function diagnoseDashboardData() {
  const result = {
    ok:false,
    time:new Date().toISOString(),
    spreadsheetId:SPREADSHEET_ID,
    sheets:{},
    errors:[]
  };

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    [
      "USER_MASTER",
      "OFFICE_MASTER",
      "DAILY_DATA",
      "DAILY_RECORDS",
      "SESSIONS"
    ].forEach(name => {
      const sh = ss.getSheetByName(name);

      result.sheets[name] = sh ? {
        exists:true,
        rows:Math.max(0,sh.getLastRow()-1),
        columns:sh.getLastColumn()
      } : {
        exists:false,
        rows:0,
        columns:0
      };
    });

    result.ok = true;
    Logger.log(JSON.stringify(result,null,2));
    return result;
  } catch(e) {
    result.errors.push(String(e.message || e));
    Logger.log(JSON.stringify(result,null,2));
    throw e;
  }
}
