# PMV Toolkit Tracker — V5

Repository: `STWNT168/pmv-toolkit-racker`

## V5 Admin/DPS Dashboard

The V5 dashboard is integrated directly into `index.html` (no separate
`admin-dashboard.html` is required).

### Admin/DPS dashboard
- SPMs updated today
- Active SPM count
- Pending SPM count
- Completion percentage
- Progress bar
- Office-wise total/updated/pending/completion
- Exact list of SPMs who have not updated
- Date selector
- Refresh and 5-minute auto-refresh

### Files changed
- `index.html`
- `backend/Code.gs`
- `js/config.js`
- `js/admin-dashboard-api.js`
- `js/admin-dashboard.js`
- `css/admin-dashboard.css`
- `js/app.js`

Other repository files remain unchanged and should stay in their existing
locations.

## Deployment

1. Replace the listed files in the GitHub repository.
2. Replace Apps Script `backend/Code.gs`.
3. Run `setupSheets()` once if required.
4. Deploy Apps Script as a new Web App version.
5. Keep the existing API URL in `js/config.js`.
6. Open the GitHub Pages application and sign in as ADMIN/DPS.
