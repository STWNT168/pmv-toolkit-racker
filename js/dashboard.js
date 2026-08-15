/**
 * dashboard.js
 * DPS/Admin consolidated dashboard: filters, KPI cards, office-wise and
 * date-wise tables, charts (Chart.js), and CSV export.
 */

const Dashboard = (() => {
  let charts = {};
  let lastPayload = null;

  async function init() {
    const today = UI.todayISO();
    document.getElementById("dash-date-from").value = UI.previousDateISO(today);
    document.getElementById("dash-date-to").value = today;

    await populateOfficeFilter();

    document.getElementById("dash-apply-filters").addEventListener("click", loadData);
    document.getElementById("dash-export-csv").addEventListener("click", exportCsv);
    document.getElementById("dash-print").addEventListener("click", () => window.print());
    document.getElementById("office-table-search").addEventListener("input", filterOfficeTable);

    document.querySelectorAll("#office-table thead th[data-sort]").forEach(th => {
      th.addEventListener("click", () => sortOfficeTable(th.dataset.sort));
    });

    await loadData();
  }

  async function populateOfficeFilter() {
    try {
      const result = await Api.getOfficeList();
      const offices = result.success ? result.data : [];
      const select = document.getElementById("dash-office-filter");
      select.innerHTML = '<option value="">All Offices</option>' +
        offices.map(o => `<option value="${o.officeId}">${o.officeName}</option>`).join("");
    } catch (e) {
      UI.toast("Could not load office list for filters.", "warning");
    }
  }

  async function loadData() {
    const params = {
      from: document.getElementById("dash-date-from").value,
      to: document.getElementById("dash-date-to").value,
      officeId: document.getElementById("dash-office-filter").value
    };

    const cacheKey = JSON.stringify(params);
    document.getElementById("dashboard-loading").classList.remove("hidden");

    try {
      const result = await Api.getDashboardData(params);
      if (!result.success) throw new Error(result.message);
      lastPayload = result.data;
      await Storage.cacheHistory(cacheKey, result.data);
    } catch (e) {
      const cached = await Storage.getCachedHistory(cacheKey);
      if (cached) {
        lastPayload = cached;
        UI.toast("Offline — showing last cached dashboard data.", "warning");
      } else {
        UI.toast("Could not load dashboard data.", "error");
        document.getElementById("dashboard-loading").classList.add("hidden");
        return;
      }
    }

    renderKpis(lastPayload.kpis);
    renderOfficeTable(lastPayload.officeWise);
    renderDateTable(lastPayload.dateWise);
    renderCharts(lastPayload);
    document.getElementById("dashboard-loading").classList.add("hidden");
  }

  function renderKpis(kpis) {
    const cards = {
      "kpi-total-came": kpis.totalCame,
      "kpi-total-delivered": kpis.totalDelivered,
      "kpi-total-redirected": kpis.totalRedirected,
      "kpi-total-pending": kpis.totalPending,
      "kpi-delivery-pct": kpis.deliveryPercent.toFixed(1) + "%",
      "kpi-mobile-invalid": kpis.mobileInvalid,
      "kpi-address-not-found": kpis.addressNotFound,
      "kpi-torn": kpis.torn,
      "kpi-incomplete": kpis.incompleteKits,
      "kpi-complete": kpis.completeKits
    };
    Object.entries(cards).forEach(([id, val]) => UI.setText(id, val));
  }

  function renderOfficeTable(rows) {
    const tbody = document.querySelector("#office-table tbody");
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${r.officeName}</td>
        <td>${r.kitsCameToday}</td>
        <td>${r.kitsDelivered}</td>
        <td>${r.redirected}</td>
        <td>${r.totalPending}</td>
        <td>${r.deliveryPercentage.toFixed(1)}%</td>
      </tr>
    `).join("");
  }

  function renderDateTable(rows) {
    const tbody = document.querySelector("#date-table tbody");
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td>${UI.toDisplayDate(r.date)}</td>
        <td>${r.kitsCameToday}</td>
        <td>${r.kitsDelivered}</td>
        <td>${r.redirected}</td>
        <td>${r.totalPending}</td>
        <td>${r.deliveryPercentage.toFixed(1)}%</td>
      </tr>
    `).join("");
  }

  function renderCharts(data) {
    destroyCharts();

    charts.trend = new Chart(document.getElementById("chart-date-trend"), {
      type: "line",
      data: {
        labels: data.dateWise.map(r => UI.toDisplayDate(r.date)),
        datasets: [{
          label: "Delivery %",
          data: data.dateWise.map(r => r.deliveryPercentage),
          borderColor: "#0a3d62",
          backgroundColor: "rgba(10,61,98,0.1)",
          tension: 0.3,
          fill: true
        }]
      },
      options: chartOptions("Date-wise Delivery Trend")
    });

    charts.officePct = new Chart(document.getElementById("chart-office-pct"), {
      type: "bar",
      data: {
        labels: data.officeWise.map(r => r.officeName),
        datasets: [{
          label: "Delivery %",
          data: data.officeWise.map(r => r.deliveryPercentage),
          backgroundColor: "#1e6091"
        }]
      },
      options: chartOptions("Office-wise Delivery %")
    });

    charts.pendingBreakdown = new Chart(document.getElementById("chart-pending-breakdown"), {
      type: "doughnut",
      data: {
        labels: ["Mobile Invalid", "Address Not Found", "Torn", "Incomplete Sets", "Complete Sets"],
        datasets: [{
          data: [
            data.kpis.mobileInvalid,
            data.kpis.addressNotFound,
            data.kpis.torn,
            data.kpis.incompleteKits,
            data.kpis.completeKits
          ],
          backgroundColor: ["#0a3d62", "#1e6091", "#3c6e91", "#60a3bc", "#a2cbe0"]
        }]
      },
      options: chartOptions("Pending Reason Breakdown")
    });

    charts.deliveredVsPending = new Chart(document.getElementById("chart-delivered-vs-pending"), {
      type: "bar",
      data: {
        labels: data.officeWise.map(r => r.officeName),
        datasets: [
          { label: "Delivered", data: data.officeWise.map(r => r.kitsDelivered), backgroundColor: "#2e7d32" },
          { label: "Pending", data: data.officeWise.map(r => r.totalPending), backgroundColor: "#c62828" }
        ]
      },
      options: chartOptions("Delivered vs Pending", true)
    });

    charts.weeklyTrend = new Chart(document.getElementById("chart-weekly-trend"), {
      type: "line",
      data: {
        labels: data.weeklyTrend.map(r => r.weekLabel),
        datasets: [{
          label: "Weekly Delivery %",
          data: data.weeklyTrend.map(r => r.deliveryPercentage),
          borderColor: "#e67e22",
          backgroundColor: "rgba(230,126,34,0.1)",
          tension: 0.3,
          fill: true
        }]
      },
      options: chartOptions("Weekly Delivery Trend")
    });
  }

  function chartOptions(title, stacked = false) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { title: { display: true, text: title }, legend: { display: true } },
      scales: stacked ? { x: { stacked: true }, y: { stacked: true } } : {}
    };
  }

  function destroyCharts() {
    Object.values(charts).forEach(c => c && c.destroy());
    charts = {};
  }

  function filterOfficeTable() {
    const term = document.getElementById("office-table-search").value.toLowerCase();
    document.querySelectorAll("#office-table tbody tr").forEach(row => {
      row.style.display = row.textContent.toLowerCase().includes(term) ? "" : "none";
    });
  }

  let sortDir = {};
  function sortOfficeTable(key) {
    if (!lastPayload) return;
    sortDir[key] = !sortDir[key];
    const rows = [...lastPayload.officeWise].sort((a, b) =>
      sortDir[key] ? (a[key] > b[key] ? 1 : -1) : (a[key] < b[key] ? 1 : -1)
    );
    renderOfficeTable(rows);
  }

  function exportCsv() {
    if (!lastPayload) return;
    const rows = [
      ["Office", "Kits Came", "Delivered", "Redirected", "Pending", "Delivery %"],
      ...lastPayload.officeWise.map(r => [
        r.officeName, r.kitsCameToday, r.kitsDelivered, r.redirected, r.totalPending, r.deliveryPercentage.toFixed(1)
      ])
    ];
    const csv = rows.map(r => r.map(v => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pmv-office-report-${UI.todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return { init };
})();
