# PMV Toolkit Management System

A mobile-first PWA for Sub-Postmasters (SPMs) to enter daily PMV toolkit
delivery data, and for DPS/Admin to monitor consolidated office-wise and
date-wise performance across Udhampur Division — built on Google Sheets +
Google Apps Script, no paid backend required.

## Stack

- **Frontend:** vanilla HTML/CSS/JavaScript, installable PWA (service worker
  + manifest), offline-first via IndexedDB
- **Backend:** Google Apps Script (`backend/Code.gs`), deployed as a Web App
- **Database:** Google Sheets
- **Charts:** Chart.js (CDN)
- **Hosting:** GitHub Pages (or any static host)

## Quick start

See **[docs/SETUP.md](docs/SETUP.md)** for the full step-by-step guide:
create the sheets, populate master data, deploy the Apps Script Web App,
point `js/config.js` at it, and push this folder to GitHub Pages.

## Project structure

```
pmv-toolkit-tracker/
├── index.html            # single-page app shell (login, SPM entry, DPS dashboard)
├── manifest.json          # PWA manifest
├── sw.js                   # service worker — offline app-shell caching
├── css/
│   └── style.css            # navy/blue government UI theme, mobile-first
├── js/
│   ├── config.js              # API URL + app constants (no secrets)
│   ├── calculations.js         # single source of truth for all business math
│   ├── validation.js            # frontend validation (convenience layer only)
│   ├── storage.js                 # IndexedDB: drafts, offline queue, cache, session
│   ├── api.js                      # fetch wrapper for the Apps Script backend
│   ├── auth.js                      # login/session/role helpers
│   ├── sync.js                       # background sync of offline-queued records
│   ├── ui.js                          # toasts, confirm modal, date helpers
│   ├── spm.js                          # SPM daily-entry screen logic
│   ├── dashboard.js                     # DPS dashboard: KPIs, tables, charts, export
│   └── app.js                            # bootstrap + view router
├── backend/
│   └── Code.gs             # Apps Script REST-like API + all server-side validation
├── icons/                  # PWA icons (192px, 512px — replace with branded versions)
└── docs/
    ├── SETUP.md             # deployment walkthrough
    ├── API.md                # endpoint reference + business rules
    └── DATABASE.md            # Google Sheets schema
```

## Non-negotiable business rules

Implemented identically on both frontend (`js/calculations.js`) and backend
(`backend/Code.gs`) so the server is never trusting client-side math:

1. Set numbers (e.g. "Set 105") are identifiers only — **never** added into
   any quantity total.
2. `TOTAL PENDING = Mobile Invalid + Address Not Found + Torn + Kits Incomplete + Kits Complete`
3. `DELIVERY % = Kits Delivered / Kits Came Today × 100` (0% if Came = 0)
4. `Kits Delivered + Redirected + Total Pending` must never exceed `Kits Came Today`
5. Pending is a lifecycle, not a blind carry-forward:
   `CURRENT PENDING = PREVIOUS CURRENT PENDING + NEW PENDING − RESOLVED PENDING`
6. One finalized record per office per date — duplicates are blocked unless
   explicitly authorized as an edit by DPS/Admin.

## Offline support

SPMs can fill in and submit data with no connectivity. Records are saved to
IndexedDB, marked "waiting for sync," and automatically retried once the
device reconnects — using a client-generated record ID as an idempotency
key so retries never create duplicate rows.

## Roles

| Role | Can do |
|---|---|
| **SPM** | Enter/submit data for their own office, view previous day + history |
| **DPS** | View all offices, date-wise/office-wise dashboards, export reports |
| **ADMIN** | Everything DPS can, plus manage master data and authorize record edits |

Role and office ownership are always re-verified server-side — the frontend's
claims about who's logged in are never trusted on their own.
