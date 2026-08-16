# Inconsistency / Fix Report — PMV Toolkit Tracker 5.0.5

1. **Missing API routing**
   - Frontend called `getOwnTodayRecord` and `deleteOwnTodayRecord`.
   - Backend contained the functions in the appended repair patch but the main `doGet`/`doPost` dispatchers did not route both actions.
   - Fixed by adding both routes.

2. **Dead API compatibility file**
   - `js/spm-api-v503.js` referenced `Api.request()`, while the current `api.js` did not expose that function.
   - It was obsolete and not loaded by `index.html`.
   - Removed from the fixed package.

3. **Missing `Auth.setSession()`**
   - `spm.js` attempted to call `Auth.setSession(s)`, but the original Auth object did not expose it.
   - Fixed by adding `setSession()`.

4. **Two dashboard implementations**
   - `index.html` contains the Admin/DPS dashboard markup.
   - The old `dashboard.js` expected a different set of dashboard DOM IDs and caused unnecessary API work.
   - Fixed package uses only the dashboard implementation matching the current HTML.

5. **DPS/Admin edit ownership inconsistency**
   - Original edit logic could validate duplicate ownership against the logged-in DPS/Admin instead of the SPM owning the record.
   - Fixed by deriving SPM ID/name from the existing record during edit.

6. **Version drift**
   - Frontend was 5.0.4 while compatibility files and release notes referred to V5.0.3/V5.
   - Standardized fixed package to 5.0.5.

7. **Service-worker cache**
   - Fixed package uses a versioned cache and removes older caches during activation.

8. **Security**
   - Server remains authoritative for session, role, office, duplicate and quantity validation.


## Admin report enhancement
- Added consolidated kits information to the office-wise report.
- Added a detailed SPM-wise report for the selected date with all daily fields: Kits Came, Delivered, Redirected, Mobile Invalid, Address Not Found, Torn, Incomplete Kits, Complete Kits, Total Pending and Delivery %.
- Backend now aggregates these values from DAILY_DATA for the selected date.
