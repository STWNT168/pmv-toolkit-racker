# API Reference — Apps Script Backend

Base URL: your deployed Web App `/exec` URL (see `js/config.js`).

All responses are JSON in the shape:

```json
{ "success": true, "message": "...", "data": {} }
```

or on failure:

```json
{ "success": false, "message": "...", "errors": [] }
```

## Authentication model

`login` issues an opaque session token after checking `USER_ID` + `MOBILE`
against `USER_MASTER`. The frontend stores this session (userId, role,
officeId, token) and sends it back with every write request as `session`.

**Every write endpoint re-derives the user's role and office from
`USER_MASTER` on the server (`authorize()` in Code.gs) rather than trusting
the role/office the client sends.** This is what stops a compromised or
modified frontend from writing data as a different office or role.

## GET endpoints

| action | params | description |
|---|---|---|
| `getOfficeList` | — | Active offices from `OFFICE_MASTER` |
| `getUser` | `userId` | Basic profile lookup |
| `getPreviousDay` | `officeId`, `date` | Previous day's record for reference (read-only) |
| `getHistory` | `officeId`, `from`, `to` | Historical records for one office |
| `getDashboardData` | `from`, `to`, `officeId` (optional) | KPIs, office-wise, date-wise, weekly trend |

## POST endpoints

| action | body | description |
|---|---|---|
| `login` | `{ userId, mobile }` | Authenticates and returns a session |
| `submitDailyRecord` | `{ record, session }` | Creates a new daily record (rejects duplicates) |
| `updateDailyRecord` | `{ record, session }` | DPS/Admin-only authorized edit of an existing record |
| `syncOfflineRecord` | `{ record, session }` | Same as submit; idempotent via `record.id` so retries never duplicate |

### `record` shape

```json
{
  "id": "2026-08-14_OFF001_1755123456789",
  "date": "2026-08-14",
  "officeId": "OFF001",
  "officeName": "Example SO",
  "kitsCameToday": 100,
  "kitsDelivered": 80,
  "redirected": 5,
  "mobileInvalid": 2,
  "addressNotFound": 3,
  "torn": 1,
  "incompleteRows": [{ "setNumber": 105, "kitsIncomplete": 4 }],
  "completeRows": [{ "setNumber": 205, "kitsComplete": 3 }],
  "previousCurrentPending": 12
}
```

## Business rules enforced server-side

These mirror `js/calculations.js` but are re-implemented independently in
`Code.gs` — the server never trusts client-computed totals:

1. Set numbers are identifiers only; never included in any quantity sum.
2. `TOTAL_PENDING = mobileInvalid + addressNotFound + torn + kitsIncomplete + kitsComplete`
3. `DELIVERY_PERCENTAGE = kitsDelivered / kitsCameToday * 100` (0 if came = 0)
4. `kitsDelivered + redirected + TOTAL_PENDING` must not exceed `kitsCameToday`
5. `CURRENT_PENDING = PREVIOUS_CURRENT_PENDING + NEW_PENDING - RESOLVED_PENDING`
   (never a blind carry-forward addition)
6. One finalized record per `(OFFICE_ID, DATE)` — duplicate submissions are
   rejected unless explicitly authorized as an edit by DPS/Admin.

## Error codes

| code | meaning |
|---|---|
| `DUPLICATE` | A record already exists for this office+date |

Validation failures return `success: false` with a `message` and an
`errors` array of every rule that failed (not just the first).
