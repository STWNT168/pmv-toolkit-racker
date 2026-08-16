/*
 PMV Toolkit V5.0.4 PATCH
 Paste this file BELOW the existing backend/Code.gs code.
 Then remove the duplicate second case "getAdminTodayUpdateStatus" in doGet.
 Deploy Apps Script as a NEW version.

 This patch fixes the concrete problems found in the repository:
 1. doGet referenced getOwnTodayRecord/deleteOwnTodayRecord but the functions were missing.
 2. SPM can delete ALL of their own DAILY_DATA rows for TODAY, so legacy duplicate rows
    from today are removed and a new submission can be made.
 3. Matching SET_TRACKER rows are removed where the SPM_ID column exists.
 4. Admin diagnostic confirms USER_MASTER/DAILY_DATA counts without modifying data.
*/

function getOwnTodayRecord(session) {
  var auth = authorize(session);
  if (auth.role !== ROLES.SPM) throw new Error("Only SPM users can access this function.");

  var today = todayISO();
  var rows = readSheetAsObjects(SHEETS.DAILY_DATA).filter(function (r) {
    return String(r.SPM_ID || "").trim() === String(auth.user.USER_ID || "").trim() &&
           normalizeSheetDate(r.DATE) === today;
  });

  rows.sort(function (a,b) { return Number(b.__row || 0) - Number(a.__row || 0); });
  return successResponse(rows.length ? mapDailyRowForClient(rows[0]) : null);
}

function mapDailyRowForClient(r) {
  return {
    rowNumber: r.__row,
    id: String(r.ID || ""),
    date: normalizeSheetDate(r.DATE),
    officeId: String(r.OFFICE_ID || ""),
    officeName: String(r.OFFICE_NAME || ""),
    spmId: String(r.SPM_ID || ""),
    spmName: String(r.SPM_NAME || ""),
    kitsCameToday: Number(r.KITS_CAME_TODAY) || 0,
    kitsDelivered: Number(r.KITS_DELIVERED) || 0,
    redirected: Number(r.REDIRECTED) || 0,
    mobileInvalid: Number(r.MOBILE_NUMBER_INVALID) || 0,
    addressNotFound: Number(r.ADDRESS_NOT_FOUND) || 0,
    torn: Number(r.TORN_CONDITION) || 0,
    kitsIncomplete: Number(r.KITS_INCOMPLETE) || 0,
    kitsComplete: Number(r.KITS_COMPLETE) || 0,
    totalPending: Number(r.TOTAL_PENDING) || 0,
    deliveryPercentage: Number(r.DELIVERY_PERCENTAGE) || 0,
    submittedAt: r.SUBMITTED_AT || "",
    updatedAt: r.UPDATED_AT || "",
    status: String(r.STATUS || "")
  };
}

/*
 SPM permission:
 - only SPM role
 - only their own USER_ID
 - only TODAY
 - deletes every duplicate for today's SPM/date, not just the newest row
 - then deletes matching SET_TRACKER rows where the tracker has SPM_ID/USER_ID/CREATED_BY
*/
function deleteOwnTodayRecord(session, recordId) {
  var auth = authorize(session);
  if (auth.role !== ROLES.SPM) {
    return errorResponse("Only SPM users can delete their own today's entry.", [], "FORBIDDEN");
  }

  var userId = String(auth.user.USER_ID || "").trim();
  var today = todayISO();
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    var sheet = getSheet(SHEETS.DAILY_DATA);
    var rows = readSheetAsObjects(SHEETS.DAILY_DATA).filter(function (r) {
      return String(r.SPM_ID || "").trim() === userId &&
             normalizeSheetDate(r.DATE) === today;
    });

    if (!rows.length) {
      return errorResponse("No entry for today was found.", [], "NOT_FOUND");
    }

    var deleted = [];
    rows.sort(function(a,b) {
      return Number(b.__row || 0) - Number(a.__row || 0);
    });

    rows.forEach(function (r) {
      sheet.deleteRow(Number(r.__row));
      deleted.push(Number(r.__row));
    });

    deleteTodaySetTrackerRows(userId, today, auth.user.OFFICE_ID);

    logAudit({
      userId: userId,
      userName: auth.user.NAME,
      role: auth.role,
      action: "DELETE_TODAY_ENTRY",
      recordId: String(recordId || ""),
      officeId: auth.user.OFFICE_ID,
      date: today,
      oldValue: JSON.stringify(deleted),
      newValue: "",
      requestInfo: "SPM deleted all own DAILY_DATA rows for current date",
      result: "SUCCESS"
    });

    return successResponse({
      deleted: true,
      rowsDeleted: deleted.length
    }, "Today's entry deleted. You can submit again.");
  } finally {
    lock.releaseLock();
  }
}

function deleteTodaySetTrackerRows(userId, date, officeId) {
  var sheet;
  try {
    sheet = getSheet(SHEETS.SET_TRACKER);
  } catch (e) {
    return;
  }

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return;

  var headers = data[0].map(function(h) {
    return String(h || "").trim().toUpperCase();
  });

  var dateCol = headers.indexOf("DATE");
  var officeCol = headers.indexOf("OFFICE_ID");
  var userCol = headers.indexOf("SPM_ID");

  if (userCol < 0) userCol = headers.indexOf("USER_ID");
  if (userCol < 0) userCol = headers.indexOf("CREATED_BY");

  if (dateCol < 0 || officeCol < 0 || userCol < 0) return;

  for (var i = data.length - 1; i >= 1; i--) {
    if (normalizeSheetDate(data[i][dateCol]) === date &&
        String(data[i][officeCol]).trim() === String(officeId).trim() &&
        String(data[i][userCol]).trim() === String(userId).trim()) {
      sheet.deleteRow(i + 1);
    }
  }
}

/*
 Run manually after deployment to verify the server can see the same data
 the Admin dashboard is supposed to see. This is READ-ONLY.
*/
function diagnoseAdminDashboardData() {
  var users = readSheetAsObjects(SHEETS.USER_MASTER);
  var records = readSheetAsObjects(SHEETS.DAILY_DATA);
  var offices = readSheetAsObjects(SHEETS.OFFICE_MASTER);
  var today = todayISO();

  var activeSpms = users.filter(function(u) {
    return isActive(u.ACTIVE) && normalizeRole(u.ROLE) === ROLES.SPM;
  });

  var updatedToday = {};
  records.forEach(function(r) {
    if (normalizeSheetDate(r.DATE) === today) {
      updatedToday[String(r.SPM_ID || "").trim()] = true;
    }
  });

  var result = {
    date: today,
    dailyDataRows: records.length,
    activeOffices: offices.filter(function(o){ return isActive(o.ACTIVE); }).length,
    activeSpms: activeSpms.length,
    updatedSpmsToday: Object.keys(updatedToday).filter(Boolean).length,
    pendingSpmsToday: activeSpms.filter(function(u) {
      return !updatedToday[String(u.USER_ID || "").trim()];
    }).length
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
