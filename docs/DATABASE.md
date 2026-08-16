# PMV Toolkit Database

## Spreadsheet

The Apps Script backend currently uses this Spreadsheet ID:

`1vEjY1z-147b38XTWV7vRm_9pjXVMfJmjdQtrKRkkLy8`

If you intentionally use a different spreadsheet, change **SPREADSHEET_ID in `backend/Code.gs`** and do not maintain two IDs in the documentation.

## Required sheets

Run `setupSheets()` once from Apps Script. It creates these sheets if missing:

### DAILY_DATA

| Column |
|---|
| ID |
| DATE |
| OFFICE_ID |
| OFFICE_NAME |
| SPM_ID |
| SPM_NAME |
| KITS_CAME_TODAY |
| KITS_DELIVERED |
| REDIRECTED |
| MOBILE_NUMBER_INVALID |
| ADDRESS_NOT_FOUND |
| TORN_CONDITION |
| INCOMPLETE_SET_NUMBER |
| KITS_INCOMPLETE |
| COMPLETE_SET_NUMBER |
| KITS_COMPLETE |
| TOTAL_PENDING |
| DELIVERY_PERCENTAGE |
| PREVIOUS_PENDING |
| NEW_PENDING |
| RESOLVED_PENDING |
| CURRENT_PENDING |
| SUBMITTED_AT |
| UPDATED_AT |
| STATUS |

### OFFICE_MASTER

`OFFICE_ID, OFFICE_NAME, DIVISION, SPM_ID, SPM_NAME, ACTIVE`

### USER_MASTER

`USER_ID, NAME, ROLE, OFFICE_ID, OFFICE_NAME, MOBILE, ACTIVE`

### SET_TRACKER

`TIMESTAMP, DATE, OFFICE_ID, SET_TYPE, SET_NUMBER, QUANTITY, ENTERED_BY`

### AUDIT_LOG

`TIMESTAMP, USER_ID, USER_NAME, ROLE, ACTION, RECORD_ID, OFFICE_ID, DATE, OLD_VALUE, NEW_VALUE, REQUEST_INFO, RESULT`

### SESSIONS

`TOKEN, USER_ID, CREATED_AT, EXPIRES_AT, ACTIVE`

Do not manually edit session rows except for emergency administration.

## Important

The application uses `DAILY_DATA.ID` as the idempotency key for offline retries.

The application also enforces one record per `(OFFICE_ID, DATE)`.
