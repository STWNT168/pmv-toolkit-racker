# PMV Toolkit V5.0.0

## Admin/DPS Dashboard

V5 adds a complete daily SPM update monitoring dashboard.

### Dashboard
- Updated SPM count
- Total active SPM count
- Pending SPM count
- Completion percentage
- Progress bar
- Office-wise total/updated/pending/completion
- List of SPMs who have not updated
- Date selection for historical monitoring
- Manual refresh
- Automatic refresh while the page is visible

### Security
The dashboard endpoint is restricted server-side to Admin/DPS users. Counts are based on distinct `SPM_ID` values.

## Deployment

1. Replace the Apps Script `Code.gs` with the V5 `Code.gs`.
2. Save the Apps Script project.
3. Run `setupSheets()` if required by the project.
4. Deploy a **new web-app version**.
5. Keep the existing API URL in `config.js`.
6. Add the V5 dashboard HTML/CSS/JS files to the frontend.
7. Call `AdminDashboard.init()` when the Admin/DPS screen opens.
