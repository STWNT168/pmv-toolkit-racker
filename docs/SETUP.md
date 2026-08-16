# PMV Toolkit Setup

## 1. Google Sheet

Use the spreadsheet referenced by `backend/Code.gs`.

Current ID:

`1vEjY1z-147b38XTWV7vRm_9pjXVMfJmjdQtrKRkkLy8`

## 2. Apps Script

Open the spreadsheet:

**Extensions → Apps Script**

Replace `Code.gs` with the corrected file supplied with this release.

Run:

`setupSheets`

Authorize the script.

It creates:

- DAILY_DATA
- OFFICE_MASTER
- USER_MASTER
- SET_TRACKER
- AUDIT_LOG
- SESSIONS

## 3. Master data

Fill `OFFICE_MASTER`.

Example:

| OFFICE_ID | OFFICE_NAME | DIVISION | SPM_ID | SPM_NAME | ACTIVE |
|---|---|---|---|---|---|
| OFF001 | Example SO | Udhampur | SPM001 | Example Name | TRUE |

Fill `USER_MASTER`.

Example:

| USER_ID | NAME | ROLE | OFFICE_ID | OFFICE_NAME | MOBILE | ACTIVE |
|---|---|---|---|---|---|---|
| SPM001 | Example Name | SPM | OFF001 | Example SO | 9999999999 | TRUE |
| DPS001 | DPS Officer | DPS | | | 9999999998 | TRUE |

Roles must be exactly:

- SPM
- DPS
- ADMIN

## 4. Deploy Web App

Apps Script:

**Deploy → New deployment → Web app**

Use:

- Execute as: **Me**
- Who has access: **Anyone**

Copy the `/exec` URL.

## 5. Frontend

Put the deployed `/exec` URL in:

`js/config.js`

as `CONFIG.API_URL`.

Do not put passwords, service-account keys or spreadsheet credentials in frontend files.

## 6. GitHub Pages

Publish the repository as a static site.

After changing JavaScript/CSS, increase `CACHE_NAME` in `sw.js`.

## 7. Test before live use

Test these cases:

1. Correct login.
2. Incorrect mobile.
3. Inactive user.
4. SPM attempts another office.
5. SPM submits once.
6. SPM submits same office/date again.
7. Network drops after submission.
8. Browser reconnects and synchronizes.
9. DPS opens dashboard.
10. SPM attempts dashboard.
11. DPS edits a record.
12. Future date is rejected.
13. Delivered + redirected + pending greater than came is rejected.
14. Invalid set quantity is rejected.
