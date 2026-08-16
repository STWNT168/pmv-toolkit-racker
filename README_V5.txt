PMV Toolkit V5 — Complete Admin/DPS Dashboard

Backend:
- getAdminTodayUpdateStatus(date) returns distinct SPM update count, total active SPMs,
  pending SPMs, completion percentage, office-wise summary and exact pending list.
- Server permits ADMIN/DPS only.

Frontend:
- admin-dashboard.html
- css/admin-dashboard.css
- js/admin-dashboard-api.js
- js/admin-dashboard.js

Install:
1. Replace Apps Script Code.gs with V5 Code.gs.
2. Save, run setupSheets(), and deploy as a NEW web-app version using the same URL.
3. Add the HTML to the Admin/DPS page.
4. Load the CSS.
5. Load admin-dashboard-api.js and admin-dashboard.js after CONFIG/Auth/Api/UI.
6. Call AdminDashboard.init() when the Admin/DPS screen opens.
