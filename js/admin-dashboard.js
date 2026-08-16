const AdminDashboard = (() => {
  let initialized = false;
  let timer = null;

  function init() {
    if (initialized) return;
    initialized = true;

    const session = Auth.getSession();
    const role = String((session && session.role) || "").toUpperCase();
    if (!["ADMIN", "DPS"].includes(role)) return;

    const date = document.getElementById("admin-dashboard-date");
    const refresh = document.getElementById("admin-dashboard-refresh");
    if (!date || !refresh) return;

    const today = typeof UI.todayISO === "function"
      ? UI.todayISO()
      : new Date().toISOString().slice(0, 10);

    date.value = today;
    date.max = today;
    refresh.addEventListener("click", () => load(date.value));
    date.addEventListener("change", () => load(date.value));

    load(today);
    timer = setInterval(() => {
      if (document.visibilityState === "visible") load(date.value, true);
    }, 300000);
  }

  async function load(date, silent = false) {
    const status = document.getElementById("admin-dashboard-status");
    const button = document.getElementById("admin-dashboard-refresh");

    if (!silent && button) {
      button.disabled = true;
      button.textContent = "Refreshing…";
    }
    if (status) {
      status.textContent = "Loading…";
      status.className = "admin-status admin-status-loading";
    }

    try {
      const data = await AdminDashboardApi.getUpdateStatus(date);
      render(data);
      if (status) {
        status.textContent = `Updated ${new Date().toLocaleTimeString()}`;
        status.className = "admin-status admin-status-success";
      }
    } catch (e) {
      console.error("Admin dashboard:", e);
      if (status) {
        status.textContent = e.message || "Unable to load dashboard.";
        status.className = "admin-status admin-status-error";
      }
    } finally {
      if (!silent && button) {
        button.disabled = false;
        button.textContent = "Refresh";
      }
    }
  }

  function render(data) {
    const updated = Number(data.spmsUpdatedToday || 0);
    const total = Number(data.activeSpms || 0);
    const pending = Number(data.spmsPendingUpdate || 0);
    const pct = Number(data.completionPercentage || 0);

    setText("admin-updated-count", updated);
    setText("admin-total-count", total);
    setText("admin-pending-count", pending);
    setText("admin-completion-percent", `${pct}%`);
    setText("admin-selected-date", data.date || "—");

    const bar = document.getElementById("admin-progress-bar");
    if (bar) {
      bar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
      bar.setAttribute("aria-valuenow", String(pct));
    }

    const officeRows = document.getElementById("admin-office-rows");
    if (officeRows) {
      officeRows.replaceChildren();
      (data.officeWise || []).forEach(o => {
        const tr = document.createElement("tr");
        [
          o.officeName || "Unassigned",
          o.totalSpms || 0,
          o.updatedSpms || 0,
          o.pendingSpms || 0,
          `${Number(o.completionPercentage || 0)}%`
        ].forEach(v => {
          const td = document.createElement("td");
          td.textContent = String(v);
          tr.appendChild(td);
        });
        officeRows.appendChild(tr);
      });
      if (!officeRows.children.length) {
        officeRows.innerHTML = '<tr><td colspan="5" class="admin-empty-cell">No active SPM offices found.</td></tr>';
      }
    }

    const pendingRows = document.getElementById("admin-pending-rows");
    if (pendingRows) {
      pendingRows.replaceChildren();
      (data.pendingSpms || []).forEach((spm, i) => {
        const tr = document.createElement("tr");
        [i + 1, spm.spmName || "—", spm.spmId || "—", spm.officeName || "Unassigned", "Not updated"]
          .forEach(v => {
            const td = document.createElement("td");
            td.textContent = String(v);
            tr.appendChild(td);
          });
        pendingRows.appendChild(tr);
      });
      if (!pendingRows.children.length) {
        pendingRows.innerHTML = '<tr><td colspan="5" class="admin-empty-cell">All active SPMs have updated.</td></tr>';
      }
    }
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  }

  return { init, load };
})();
