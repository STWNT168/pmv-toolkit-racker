# PMV Toolkit — V5.0.0

A PMV Toolkit management and monitoring application with a complete Admin/DPS dashboard.

## V5 Admin Dashboard

The dashboard provides:

- **SPMs Updated Today**
- **Active SPMs**
- **Pending Updates**
- **Completion %**
- **Progress bar**
- **Office-wise pending/update status**
- **List of SPMs who have not updated**
- Date-based monitoring
- Manual refresh
- Automatic refresh while the dashboard is visible

## Files

```text
Code.gs
admin-dashboard.html
css/admin-dashboard.css
js/admin-dashboard-api.js
js/admin-dashboard.js
VERSION
VERSION.txt
RELEASE_NOTES_V5.md
README_GITHUB.md
```

## Apps Script

Replace the deployed Apps Script `Code.gs` with the V5 `Code.gs`, save it, and deploy a **new web-app version**.

Do not change the existing API URL in the frontend configuration unless you intentionally create a different deployment.

## Frontend

Load the dashboard files after the existing `CONFIG`, `Auth`, `Api`, and `UI` modules.

Then initialize:

```js
AdminDashboard.init();
```

## Security

The Admin/DPS dashboard data is protected by server-side authorization. The backend calculates update counts and pending SPMs rather than trusting values supplied by the browser.

## Version

**5.0.0**
