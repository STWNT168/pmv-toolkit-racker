/**
 * dashboard.js
 * Robust DPS/Admin dashboard.
 *
 * Important fixes:
 * - A missing/empty DAILY_DATA sheet no longer breaks the dashboard.
 * - Office-list failure no longer prevents dashboard data from loading.
 * - Cache failures no longer make a successful API response look like an API failure.
 * - Server error messages are shown instead of the generic "Could not load dashboard data."
 * - Empty arrays and missing KPI fields are handled safely.
 * - Dashboard initialization is idempotent, so retrying does not duplicate handlers.
 */

const Dashboard = (() => {
  let charts = {};
  let lastPayload = null;
  let initialized = false;
  let sortDir = {};

  const $ = id => document.getElementById(id);

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  function pct(value) {
    return num(value).toFixed(1) + "%";
  }

  function normalizeOffice(item) {
    item = item || {};
    return {
      officeId: String(item.officeId ?? item.OFFICE_ID ?? "").trim(),
      officeName: String(item.officeName ?? item.OFFICE_NAME ?? item.name ?? "").trim(),
      division: String(item.division ?? item.DIVISION ?? "").trim()
    };
  }

  function normalizeDashboardData(data) {
    data = data || {};

    const rawKpis = data.kpis || {};
    const kpis = {
      totalCame: num(rawKpis.totalCame),
      totalDelivered: num(rawKpis.totalDelivered),
      totalRedirected: num(rawKpis.totalRedirected),
      totalPending: num(rawKpis.totalPending),
      deliveryPercent: num(rawKpis.deliveryPercent),
      mobileInvalid: num(rawKpis.mobileInvalid),
      addressNotFound: num(rawKpis.addressNotFound),
      torn: num(rawKpis.torn),
      incompleteKits: num(rawKpis.incompleteKits),
      completeKits: num(rawKpis.completeKits)
    };

    const officeWise = safeArray(data.officeWise).map(r => ({
      officeId: String(r.officeId ?? r.OFFICE_ID ?? "").trim(),
      officeName: String(r.officeName ?? r.OFFICE_NAME ?? "").trim() || "Unknown Office",
      kitsCameToday: num(r.kitsCameToday),
      kitsDelivered: num(r.kitsDelivered),
      redirected: num(r.redirected),
      totalPending: num(r.totalPending),
      deliveryPercentage: num(r.deliveryPercentage)
    }));

    const dateWise = safeArray(data.dateWise).map(r => ({
      date: String(r.date ?? r.DATE ?? "").trim(),
      kitsCameToday: num(r.kitsCameToday),
      kitsDelivered: num(r.kitsDelivered),
      redirected: num(r.redirected),
      totalPending: num(r.totalPending),
      deliveryPercentage: num(r.deliveryPercentage)
    }));

    const weeklyTrend = safeArray(data.weeklyTrend).map(r => ({
      weekLabel: String(r.weekLabel ?? "").trim(),
      deliveryPercentage: num(r.deliveryPercentage)
    }));

    return { kpis, officeWise, dateWise, weeklyTrend };
  }

  async function init() {
    if (initialized) {
      await loadData();
      return;
    }

    const today = UI.todayISO();
    const from = $("dash-date-from");
    const to = $("dash-date-to");

    if (from) from.value = UI.previousDateISO(today);
    if (to) to.value = today;

    bindHandlers();
    initialized = true;

    await populateOfficeFilter();
    await loadData();
  }

  function bindHandlers() {
    const apply = $("dash-apply-filters");
    const exportBtn = $("dash-export-csv");
    const printBtn = $("dash-print");
    const search = $("office-table-search");

    if (apply) apply.addEventListener("click", loadData);
    if (exportBtn) exportBtn.addEventListener("click", exportCsv);
    if (printBtn) printBtn.addEventListener("click", () => window.print());
    if (search) search.addEventListener("input", filterOfficeTable);

    document.querySelectorAll("#office-table thead th[data-sort]").forEach(th => {
      th.addEventListener("click", () => sortOfficeTable(th.dataset.sort));
    });
  }

  async function populateOfficeFilter() {
    const select = $("dash-office-filter");
    if (!select) return;

    select.innerHTML = "";
    const all = document.createElement("option");
    all.value = "";
    all.textContent = "All Offices";
    select.appendChild(all);

    try {
      const result = await Api.getOfficeList();

      if (!result || result.success !== true) {
        throw new Error((result && result.message) || "Office list could not be loaded.");
      }

      const offices = safeArray(result.data)
        .map(normalizeOffice)
        .filter(o => o.officeId && o.officeName);

      offices.sort((a, b) => a.officeName.localeCompare(b.officeName));

      offices.forEach(o => {
        const option = document.createElement("option");
        option.value = o.officeId;
        option.textContent = o.officeName;
        select.appendChild(option);
      });

      if (!offices.length) {
        UI.toast("OFFICE_MASTER is empty or has no active offices.", "warning");
      }
    } catch (e) {
      // Do not stop the dashboard. The backend can still return consolidated data.
      UI.toast("Office filter: " + getErrorMessage(e), "warning");
    }
  }

  function getParams() {
    return {
      from: $("dash-date-from") ? $("dash-date-from").value : "",
      to: $("dash-date-to") ? $("dash-date-to").value : "",
      officeId: $("dash-office-filter") ? $("dash-office-filter").value : ""
    };
  }

  async function loadData() {
    const loading = $("dashboard-loading");
    if (loading) loading.classList.remove("hidden");

    const params = getParams();
    const cacheKey = "dashboard:" + JSON.stringify(params);

    try {
      let payload;

      try {
        const result = await Api.getDashboardData(params);

        if (!result || result.success !== true) {
          throw new Error((result && result.message) || "Dashboard API returned an unsuccessful response.");
        }

        payload = normalizeDashboardData(result.data);

        // Cache is optional. A cache error must never turn a good API response into an error.
        try {
          await Storage.cacheHistory(cacheKey, payload);
        } catch (cacheError) {
          console.warn("Dashboard cache write failed:", cacheError);
        }
      } catch (apiError) {
        const cached = await getCachedDashboard(cacheKey);

        if (cached) {
          payload = normalizeDashboardData(cached);
          UI.toast("Offline — showing last cached dashboard data.", "warning");
        } else {
          throw apiError;
        }
      }

      lastPayload = payload;
      renderAll(payload);
    } catch (e) {
      lastPayload = null;
      clearDashboard();
      UI.toast("Dashboard error: " + getErrorMessage(e), "error");
      console.error("Dashboard load error:", e);
    } finally {
      if (loading) loading.classList.add("hidden");
    }
  }

  async function getCachedDashboard(cacheKey) {
    try {
      return await Storage.getCachedHistory(cacheKey);
    } catch (e) {
      console.warn("Dashboard cache read failed:", e);
      return null;
    }
  }

  function getErrorMessage(e) {
    if (!e) return "Unknown error.";
    if (typeof e === "string") return e;
    return e.message || String(e);
  }

  function renderAll(data) {
    renderKpis(data.kpis);
    renderOfficeTable(data.officeWise);
    renderDateTable(data.dateWise);
    renderCharts(data);
  }

  function clearDashboard() {
    renderKpis({
      totalCame: 0,
      totalDelivered: 0,
      totalRedirected: 0,
      totalPending: 0,
      deliveryPercent: 0,
      mobileInvalid: 0,
      addressNotFound: 0,
      torn: 0,
      incompleteKits: 0,
      completeKits: 0
    });

    renderOfficeTable([]);
    renderDateTable([]);
    destroyCharts();
  }

  function renderKpis(kpis) {
    const cards = {
      "kpi-total-came": num(kpis.totalCame),
      "kpi-total-delivered": num(kpis.totalDelivered),
      "kpi-total-redirected": num(kpis.totalRedirected),
      "kpi-total-pending": num(kpis.totalPending),
      "kpi-delivery-pct": pct(kpis.deliveryPercent),
      "kpi-mobile-invalid": num(kpis.mobileInvalid),
      "kpi-address-not-found": num(kpis.addressNotFound),
      "kpi-torn": num(kpis.torn),
      "kpi-incomplete": num(kpis.incompleteKits),
      "kpi-complete": num(kpis.completeKits)
    };

    Object.entries(cards).forEach(([id, value]) => {
      if ($(id)) UI.setText(id, value);
    });
  }

  function renderOfficeTable(rows) {
    const tbody = document.querySelector("#office-table tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    safeArray(rows).forEach(r => {
      const tr = document.createElement("tr");

      [
        r.officeName,
        r.kitsCameToday,
        r.kitsDelivered,
        r.redirected,
        r.totalPending,
        pct(r.deliveryPercentage)
      ].forEach(value => {
        const td = document.createElement("td");
        td.textContent = value;
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
  }

  function renderDateTable(rows) {
    const tbody = document.querySelector("#date-table tbody");
    if (!tbody) return;

    tbody.innerHTML = "";

    safeArray(rows).forEach(r => {
      const tr = document.createElement("tr");
      const displayDate = r.date ? UI.toDisplayDate(r.date) : "—";

      [
        displayDate,
        r.kitsCameToday,
        r.kitsDelivered,
        r.redirected,
        r.totalPending,
        pct(r.deliveryPercentage)
      ].forEach(value => {
        const td = document.createElement("td");
        td.textContent = value;
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });
  }

  function renderCharts(data) {
    if (typeof Chart === "undefined") {
      console.warn("Chart.js is not available; skipping charts.");
      return;
    }

    destroyCharts();

    const trendEl = $("chart-date-trend");
    const officeEl = $("chart-office-pct");
    const pendingEl = $("chart-pending-breakdown");
    const deliveredPendingEl = $("chart-delivered-vs-pending");
    const weeklyEl = $("chart-weekly-trend");

    if (trendEl) {
      charts.trend = new Chart(trendEl, {
        type: "line",
        data: {
          labels: data.dateWise.map(r => r.date ? UI.toDisplayDate(r.date) : "—"),
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
    }

    if (officeEl) {
      charts.officePct = new Chart(officeEl, {
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
    }

    if (pendingEl) {
      charts.pendingBreakdown = new Chart(pendingEl, {
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
    }

    if (deliveredPendingEl) {
      charts.deliveredVsPending = new Chart(deliveredPendingEl, {
        type: "bar",
        data: {
          labels: data.officeWise.map(r => r.officeName),
          datasets: [
            {
              label: "Delivered",
              data: data.officeWise.map(r => r.kitsDelivered),
              backgroundColor: "#2e7d32"
            },
            {
              label: "Pending",
              data: data.officeWise.map(r => r.totalPending),
              backgroundColor: "#c62828"
            }
          ]
        },
        options: chartOptions("Delivered vs Pending", true)
      });
    }

    if (weeklyEl) {
      charts.weeklyTrend = new Chart(weeklyEl, {
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
  }

  function chartOptions(title, stacked = false) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: title },
        legend: { display: true }
      },
      scales: stacked
        ? { x: { stacked: true }, y: { stacked: true } }
        : {}
    };
  }

  function destroyCharts() {
    Object.values(charts).forEach(chart => {
      try {
        if (chart) chart.destroy();
      } catch (e) {
        console.warn("Chart destroy failed:", e);
      }
    });
    charts = {};
  }

  function filterOfficeTable() {
    const search = $("office-table-search");
    if (!search) return;

    const term = search.value.toLowerCase().trim();

    document.querySelectorAll("#office-table tbody tr").forEach(row => {
      row.style.display = row.textContent.toLowerCase().includes(term) ? "" : "none";
    });
  }

  function sortOfficeTable(key) {
    if (!lastPayload) return;

    sortDir[key] = !sortDir[key];

    const rows = [...lastPayload.officeWise].sort((a, b) => {
      const av = a[key];
      const bv = b[key];

      if (typeof av === "string" || typeof bv === "string") {
        return sortDir[key]
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      }

      return sortDir[key] ? num(av) - num(bv) : num(bv) - num(av);
    });

    renderOfficeTable(rows);
  }

  function exportCsv() {
    if (!lastPayload) {
      UI.toast("No dashboard data available to export.", "warning");
      return;
    }

    const rows = [
      ["Office", "Kits Came", "Delivered", "Redirected", "Pending", "Delivery %"],
      ...lastPayload.officeWise.map(r => [
        r.officeName,
        r.kitsCameToday,
        r.kitsDelivered,
        r.redirected,
        r.totalPending,
        num(r.deliveryPercentage).toFixed(1)
      ])
    ];

    const csv = rows
      .map(row => row.map(value => {
        const text = String(value ?? "");
        return '"' + text.replace(/"/g, '""') + '"';
      }).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = `pmv-office-report-${UI.todayISO()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return { init, loadData };
})();
