# PMV Toolkit Tracker — Fixed Build

Fixed package for the PMV Toolkit Management System.

## Main fixes
- Added the missing `getOwnTodayRecord` GET route.
- Added the missing `deleteOwnTodayRecord` POST route.
- Removed the obsolete `spm-api-v503.js` compatibility layer that referenced a non-existent `Api.request()`.
- Added `Auth.setSession()` so authoritative office/user data can be persisted after login.
- Stopped the obsolete dashboard module from making an unnecessary second dashboard request.
- Kept one dashboard implementation (`admin-dashboard.js`) matching the HTML actually present in `index.html`.
- Fixed DPS/Admin record-edit ownership/duplicate checking.
- Added safer server-side record normalization and validation.
- Kept SPM office authorization server-side.
- Kept duplicate/idempotency protection for offline retries.
- Added cache/version-busting to the service worker.
- Standardized the application version to 5.0.5.

## Google Apps Script
Deploy `backend/Code.gs` as the Web App backend. Run `setupSheets()` once in Apps Script before first use.

Then put the deployed Web App URL in `js/config.js`.

## Static hosting
The frontend can be hosted on GitHub Pages or another static host.
