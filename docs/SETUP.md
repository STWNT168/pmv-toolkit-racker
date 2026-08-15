# Setup Guide — PMV Toolkit Management System

## 1. Prepare the Google Sheet (database)

1. Open the spreadsheet with ID `1_RtqFQ44jU8xXGmPE9vu2oOLTPbW3kg7MZS88P49E58`
   (or create a new one and update the ID in `backend/Code.gs`).
2. Go to **Extensions → Apps Script**.
3. Delete any starter code and paste in the contents of `backend/Code.gs`.
4. In the Apps Script editor, select the function `setupSheets` from the
   function dropdown and click **Run**. This creates the 5 required sheets
   with correct header rows (safe to re-run — it won't overwrite existing data):
   - `DAILY_DATA`
   - `OFFICE_MASTER`
   - `USER_MASTER`
   - `SET_TRACKER`
   - `AUDIT_LOG`
5. Grant the permissions Apps Script asks for (it needs to read/write this
   spreadsheet under your account).

## 2. Fill in master data

Before anyone can log in or submit data, populate two sheets manually:

**OFFICE_MASTER** — one row per post office (all 39 offices of Udhampur
Division), columns: `OFFICE_ID, OFFICE_NAME, DIVISION, SPM_ID, SPM_NAME, ACTIVE`.
Set `ACTIVE` to `TRUE`.

**USER_MASTER** — one row per person who will log in, columns:
`USER_ID, NAME, ROLE, OFFICE_ID, OFFICE_NAME, MOBILE, ACTIVE`.
`ROLE` must be exactly `SPM`, `DPS`, or `ADMIN`. `MOBILE` is the number the
user will type in to sign in (acts as a simple shared-secret alongside the
User ID — see `docs/API.md` for how login works and how to harden it later).

## 3. Deploy the Apps Script as a Web App

1. In the Apps Script editor: **Deploy → New deployment**.
2. Select type **Web app**.
3. Execute as: **Me**.
4. Who has access: **Anyone** (the script enforces its own authorization
   internally — see `docs/API.md`).
5. Click **Deploy**, authorize again if prompted, and copy the **Web app URL**
   (ends in `/exec`).

Every time you edit `Code.gs`, you must create a **new version** under
**Deploy → Manage deployments → Edit → New version** for changes to go live.

## 4. Point the frontend at your backend

Open `js/config.js` and set:

```js
API_URL: "https://script.google.com/macros/s/XXXXXXXXXXXX/exec"
```

## 5. Generate real icons (optional)

The `icons/` folder ships with simple placeholder PNGs. Replace
`icons/icon-192.png` and `icons/icon-512.png` with your own India Post /
Udhampur Division branded icons at the same file names and sizes.

## 6. Deploy the frontend to GitHub Pages

1. Push this whole `pmv-toolkit-tracker/` folder to a GitHub repository.
2. In the repo: **Settings → Pages → Deploy from a branch**, choose `main`
   and the root folder.
3. Your app will be live at `https://<your-username>.github.io/<repo-name>/`.
4. Because this is a PWA, users can "Add to Home Screen" on Android to
   install it like a native app.

## 7. Test the flow

1. Open the deployed URL, log in as an SPM using a `USER_ID`/`MOBILE` pair
   from `USER_MASTER`.
2. Submit a test daily record for a test office.
3. Log in as a `DPS` user and confirm the record appears on the dashboard.
4. Turn off your device's Wi-Fi/data, submit another record as SPM, confirm
   it's saved locally with a "waiting for sync" badge, then reconnect and
   confirm it syncs automatically.

## Notes on the login/session model

This first version uses a lightweight User ID + registered mobile check
instead of full OAuth, to keep it simple for field-level SPM use on shared
or personal Android phones. It is intentionally NOT a substitute for strong
authentication — if stronger security is needed later (e.g. OTP-based login
or Google Workspace SSO restricted to `@indiapost.gov.in` accounts), that
can be layered in without changing the rest of the architecture.
