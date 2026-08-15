# Database Schema — Google Sheets

Spreadsheet ID: `1_RtqFQ44jU8xXGmPE9vu2oOLTPbW3kg7MZS88P49E58`

Run `setupSheets()` in `backend/Code.gs` once to create all sheets below
with the correct header row. Column order matters — the backend reads/writes
by header name, but keep it consistent with this doc when editing manually.

## DAILY_DATA

One row per office per date. `ID` is the unique key (also enforced logically
via `OFFICE_ID` + `DATE` duplicate checking).

| Column | Type | Notes |
|---|---|---|
| ID | text | `date_officeId_timestamp` |
| DATE | date (yyyy-mm-dd) | |
| OFFICE_ID | text | FK → OFFICE_MASTER |
| OFFICE_NAME | text | denormalized for fast reads |
| SPM_ID | text | FK → USER_MASTER |
| SPM_NAME | text | |
| KITS_CAME_TODAY | number | |
| KITS_DELIVERED | number | |
| REDIRECTED | number | |
| MOBILE_NUMBER_INVALID | number | pending reason |
| ADDRESS_NOT_FOUND | number | pending reason |
| TORN_CONDITION | number | pending reason |
| INCOMPLETE_SET_NUMBER | text | comma-separated identifiers only, never summed |
| KITS_INCOMPLETE | number | sum of all incomplete-set quantities |
| COMPLETE_SET_NUMBER | text | comma-separated identifiers only, never summed |
| KITS_COMPLETE | number | sum of all complete-set quantities |
| TOTAL_PENDING | number | see formula in docs/API.md |
| DELIVERY_PERCENTAGE | number | 1 decimal |
| PREVIOUS_PENDING | number | yesterday's CURRENT_PENDING carried in |
| NEW_PENDING | number | = TOTAL_PENDING for that day |
| RESOLVED_PENDING | number | reserved for future "mark resolved" feature |
| CURRENT_PENDING | number | lifecycle total, see docs/API.md |
| SUBMITTED_AT | datetime (ISO) | |
| UPDATED_AT | datetime (ISO) | |
| STATUS | text | `SUBMITTED` (soft-delete pattern reserved for future use) |

## OFFICE_MASTER

| Column | Type | Notes |
|---|---|---|
| OFFICE_ID | text | unique |
| OFFICE_NAME | text | |
| DIVISION | text | e.g. "Udhampur Division" |
| SPM_ID | text | default assigned SPM |
| SPM_NAME | text | |
| ACTIVE | TRUE/FALSE | inactive offices are hidden from dropdowns |

## USER_MASTER

| Column | Type | Notes |
|---|---|---|
| USER_ID | text | unique, used to log in |
| NAME | text | |
| ROLE | text | `SPM` \| `DPS` \| `ADMIN` |
| OFFICE_ID | text | FK → OFFICE_MASTER (blank for DPS/ADMIN covering all offices) |
| OFFICE_NAME | text | |
| MOBILE | text | 10-digit, used as login credential |
| ACTIVE | TRUE/FALSE | inactive accounts are rejected at login |

## SET_TRACKER

Append-only log of every individual set number entered, for future set-level
traceability/audit (e.g. "which office reported set 105 as incomplete").

| Column | Type | Notes |
|---|---|---|
| TIMESTAMP | datetime (ISO) | |
| DATE | date | |
| OFFICE_ID | text | |
| SET_TYPE | text | `INCOMPLETE` \| `COMPLETE` |
| SET_NUMBER | number | identifier only |
| QUANTITY | number | kits incomplete/complete for that set |
| ENTERED_BY | text | USER_ID |

## AUDIT_LOG

Append-only. Every create, update, and login is logged; deletions are
intentionally not implemented in v1 — records are soft-managed via `STATUS`
rather than removed, to preserve a complete trail.

| Column | Type | Notes |
|---|---|---|
| TIMESTAMP | datetime (ISO) | |
| USER_ID | text | |
| USER_NAME | text | |
| ROLE | text | |
| ACTION | text | `LOGIN` \| `CREATE` \| `UPDATE` \| `CREATE_DENIED` |
| RECORD_ID | text | |
| OFFICE_ID | text | |
| DATE | date | |
| OLD_VALUE | text | JSON snapshot before change (UPDATE only) |
| NEW_VALUE | text | JSON snapshot submitted |
| REQUEST_INFO | text | reserved (Apps Script doesn't expose caller IP) |
| RESULT | text | `SUCCESS` \| `DENIED: ...` |
