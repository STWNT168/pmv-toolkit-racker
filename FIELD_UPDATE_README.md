# PMV Toolkit v8 field update

This package changes the SPM/Admin field set to match Pmv-toolkit-tracker1:

SPM fields:
- All Kits / Total Kits
- Similar Article / Tool Kit Article
- Kit Counts: Invalid Mobile, Deliverable, Incomplete, Without Proper Details / Address
- Article Counts: Invalid Mobile, Deliverable, Incomplete, Without Proper Details / Address

Admin dashboard shows the same fields office-wise and SPM-wise.

Deployment:
1. Replace the corresponding files in pmv-toolkit-racker.
2. Replace backend/Code.gs with the supplied v8 backend.
3. Put the real Spreadsheet ID in backend/Code.gs.
4. Run setupSheetsV8() once.
5. Redeploy Apps Script as a Web App.
6. Keep USER_MASTER and OFFICE_MASTER data; ensure DAILY_DATA is backed up before changing its header.
7. Test one SPM submission, then verify Admin dashboard.
