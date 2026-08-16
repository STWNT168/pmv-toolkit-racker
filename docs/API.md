# PMV Toolkit API

## Authentication

`login` accepts `USER_ID + MOBILE` and creates a server-side session in `SESSIONS`.

All subsequent GET and POST operations require:

```json
{
  "userId": "...",
  "token": "..."
}
```

The backend verifies the token against `SESSIONS`, checks expiry, then reads role and office from `USER_MASTER`.

The client cannot choose its own role or office permissions.

## POST

### login

```json
{
  "action": "login",
  "userId": "SPM001",
  "mobile": "9999999999"
}
```

### submitDailyRecord

Creates a new record. SPM users can only create records for their own office.

### syncOfflineRecord

Same secure create path as `submitDailyRecord`.

If the same `record.id` already exists, the server returns success with `alreadyProcessed: true`.

This prevents duplicate rows when the browser loses the response after a successful write.

### updateDailyRecord

DPS/Admin only.

The record must already exist and must contain its real `id`.

The client cannot set an `_authorizedEdit` flag to bypass security.

### logout

Invalidates the current server session.

## GET

All GET requests require an authenticated `session` query parameter.

- `getOfficeList`
- `getUser`
- `getPreviousDay`
- `getHistory`
- `getDashboardData`

SPM users are restricted to their own office.

DPS/Admin can access the dashboard.

## Server-side business rules

1. Set numbers are identifiers only.
2. `TOTAL_PENDING = mobile invalid + address not found + torn + incomplete kits + complete kits`.
3. `DELIVERY_PERCENTAGE = delivered / came × 100`; zero if came is zero.
4. `delivered + redirected + total pending <= came`.
5. Previous pending is read from the previous calendar day's server record.
6. There is currently no resolved-pending input field, so `RESOLVED_PENDING = 0`.
7. One record per `(OFFICE_ID, DATE)`.
8. `DAILY_DATA.ID` is the idempotency key.
