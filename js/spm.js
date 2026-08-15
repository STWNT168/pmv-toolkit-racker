/**
 * spm.js
 * Drives the SPM daily-entry screen: previous-day reference, today's figures,
 * dynamic incomplete/complete set rows, live totals, draft saving, offline
 * queueing, and submission with duplicate-check + confirmation.
 */

const SPM = (() => {
  let offices = [];
  let incompleteRowCount = 0;
  let completeRowCount = 0;
  let currentOffice = null;

  async function init() {
    const session = Auth.getSession();
    document.getElementById("spm-date").value = UI.todayISO();
    document.getElementById("spm-date").max = UI.todayISO();

    await loadOffices();

    // SPM users are locked to their own office; DPS/ADMIN acting in this
    // view (e.g. entering on behalf of an office) may choose any office.
    const officeSelect = document.getElementById("spm-office");
    if (session.role === CONFIG.ROLES.SPM) {
      officeSelect.value = session.officeId;
      officeSelect.disabled = true;
      currentOffice = session.officeId;
      await onOfficeOrDateChange();
    }

    officeSelect.addEventListener("change", onOfficeOrDateChange);
    document.getElementById("spm-date").addEventListener("change", onOfficeOrDateChange);

    document.getElementById("add-incomplete-set").addEventListener("click", () => addSetRow("incomplete"));
    document.getElementById("add-complete-set").addEventListener("click", () => addSetRow("complete"));

    document.getElementById("btn-save-draft").addEventListener("click", saveDraft);
    document.getElementById("btn-submit").addEventListener("click", handleSubmitClick);

    document.getElementById("spm-form").addEventListener("input", recalculate);

    addSetRow("incomplete");
    addSetRow("complete");
    recalculate();
  }

  async function loadOffices() {
    try {
      const result = await Api.getOfficeList();
      offices = result.success ? result.data : [];
    } catch (e) {
      offices = [];
      UI.toast("Could not load office list. Working offline.", "warning");
    }
    const select = document.getElementById("spm-office");
    select.innerHTML = '<option value="">Select Office</option>' +
      offices.map(o => `<option value="${o.officeId}">${o.officeName}</option>`).join("");
  }

  async function onOfficeOrDateChange() {
    const officeId = document.getElementById("spm-office").value;
    const date = document.getElementById("spm-date").value;
    currentOffice = officeId;
    if (!officeId || !date) return;

    await loadPreviousDay(officeId, date);
    await loadDraftIfExists(date, officeId);
  }

  async function loadPreviousDay(officeId, date) {
    const prevDate = UI.previousDateISO(date);
    UI.setText("prev-date-label", UI.toDisplayDate(prevDate));

    try {
      const result = await Api.getPreviousDay(officeId, date);
      const d = result.success ? result.data : null;
      UI.setText("prev-came", d ? d.kitsCameToday : "—");
      UI.setText("prev-delivered", d ? d.kitsDelivered : "—");
      UI.setText("prev-redirected", d ? d.redirected : "—");
      UI.setText("prev-pending", d ? d.currentPending : "—");
      document.getElementById("spm-prev-pending-hidden").value = d ? d.currentPending : 0;
    } catch (e) {
      UI.setText("prev-came", "—");
      UI.setText("prev-delivered", "—");
      UI.setText("prev-redirected", "—");
      UI.setText("prev-pending", "—");
      document.getElementById("spm-prev-pending-hidden").value = 0;
    }
  }

  async function loadDraftIfExists(date, officeId) {
    const draft = await Storage.getDraft(date, officeId);
    if (draft && draft.formData) {
      populateForm(draft.formData);
      UI.toast("Draft restored for this office/date.", "info");
    }
  }

  function addSetRow(kind) {
    const isIncomplete = kind === "incomplete";
    const container = document.getElementById(isIncomplete ? "incomplete-rows" : "complete-rows");
    const idx = isIncomplete ? ++incompleteRowCount : ++completeRowCount;
    const qtyLabel = isIncomplete ? "Kits Incomplete" : "Kits Complete";
    const qtyField = isIncomplete ? "kitsIncomplete" : "kitsComplete";

    const row = document.createElement("div");
    row.className = "set-row";
    row.dataset.rowIndex = idx;
    row.innerHTML = `
      <div class="set-row-header">Set ${idx}</div>
      <div class="field-group">
        <label>Set Number <span class="hint">(identifier only)</span></label>
        <input type="number" inputmode="numeric" class="set-number" placeholder="e.g. 105">
      </div>
      <div class="field-group">
        <label>${qtyLabel}</label>
        <input type="number" inputmode="numeric" min="0" class="${qtyField}" placeholder="0">
      </div>
      ${idx > 1 ? '<button type="button" class="btn-remove-row" aria-label="Remove set">✕ Remove</button>' : ""}
    `;

    const removeBtn = row.querySelector(".btn-remove-row");
    if (removeBtn) {
      removeBtn.addEventListener("click", () => {
        row.remove();
        recalculate();
      });
    }

    container.appendChild(row);
  }

  function collectSetRows(kind) {
    const isIncomplete = kind === "incomplete";
    const container = document.getElementById(isIncomplete ? "incomplete-rows" : "complete-rows");
    const qtyField = isIncomplete ? "kitsIncomplete" : "kitsComplete";
    const rows = [];
    container.querySelectorAll(".set-row").forEach(rowEl => {
      const setNumber = rowEl.querySelector(".set-number").value;
      const qty = rowEl.querySelector(`.${qtyField}`).value;
      rows.push({
        setNumber: setNumber === "" ? "" : parseInt(setNumber, 10),
        [qtyField]: qty === "" ? 0 : parseInt(qty, 10)
      });
    });
    return rows;
  }

  function collectFormData() {
    const session = Auth.getSession();
    return {
      date: document.getElementById("spm-date").value,
      officeId: document.getElementById("spm-office").value,
      officeName: document.getElementById("spm-office").selectedOptions[0]?.textContent || "",
      spmId: session.userId,
      spmName: session.name,
      kitsCameToday: document.getElementById("kits-came").value,
      kitsDelivered: document.getElementById("kits-delivered").value,
      redirected: document.getElementById("redirected").value,
      mobileInvalid: document.getElementById("mobile-invalid").value,
      addressNotFound: document.getElementById("address-not-found").value,
      torn: document.getElementById("torn-condition").value,
      incompleteRows: collectSetRows("incomplete"),
      completeRows: collectSetRows("complete"),
      previousCurrentPending: document.getElementById("spm-prev-pending-hidden").value || 0
    };
  }

  function populateForm(data) {
    document.getElementById("kits-came").value = data.kitsCameToday || "";
    document.getElementById("kits-delivered").value = data.kitsDelivered || "";
    document.getElementById("redirected").value = data.redirected || "";
    document.getElementById("mobile-invalid").value = data.mobileInvalid || "";
    document.getElementById("address-not-found").value = data.addressNotFound || "";
    document.getElementById("torn-condition").value = data.torn || "";

    document.getElementById("incomplete-rows").innerHTML = "";
    document.getElementById("complete-rows").innerHTML = "";
    incompleteRowCount = 0;
    completeRowCount = 0;

    (data.incompleteRows && data.incompleteRows.length ? data.incompleteRows : [{}]).forEach(row => {
      addSetRow("incomplete");
      const rowEl = document.querySelectorAll("#incomplete-rows .set-row");
      const last = rowEl[rowEl.length - 1];
      if (row.setNumber !== undefined) last.querySelector(".set-number").value = row.setNumber;
      if (row.kitsIncomplete !== undefined) last.querySelector(".kitsIncomplete").value = row.kitsIncomplete;
    });

    (data.completeRows && data.completeRows.length ? data.completeRows : [{}]).forEach(row => {
      addSetRow("complete");
      const rowEl = document.querySelectorAll("#complete-rows .set-row");
      const last = rowEl[rowEl.length - 1];
      if (row.setNumber !== undefined) last.querySelector(".set-number").value = row.setNumber;
      if (row.kitsComplete !== undefined) last.querySelector(".kitsComplete").value = row.kitsComplete;
    });

    recalculate();
  }

  function recalculate() {
    const data = collectFormData();

    const totalPending = Calculations.calculateTotalPending({
      mobileInvalid: data.mobileInvalid,
      addressNotFound: data.addressNotFound,
      torn: data.torn,
      incompleteRows: data.incompleteRows,
      completeRows: data.completeRows
    });

    const deliveryPct = Calculations.calculateDeliveryPercent(data.kitsDelivered, data.kitsCameToday);

    const totalIncomplete = Calculations.sumIncompleteKits(data.incompleteRows);
    const totalComplete = Calculations.sumCompleteKits(data.completeRows);

    UI.setText("total-incomplete", totalIncomplete);
    UI.setText("total-complete", totalComplete);
    UI.setText("total-pending", totalPending);
    UI.setText("delivery-percent", deliveryPct.toFixed(1) + "%");

    const check = Calculations.checkDeliverySumWithinCame({
      kitsCameToday: data.kitsCameToday,
      kitsDelivered: data.kitsDelivered,
      redirected: data.redirected,
      totalPending
    });

    const warningEl = document.getElementById("sum-warning");
    if (!check.valid && data.kitsCameToday !== "") {
      warningEl.textContent = `⚠ Delivered + Redirected + Pending (${check.sum}) exceeds Kits Came Today (${check.came}).`;
      warningEl.classList.remove("hidden");
    } else {
      warningEl.classList.add("hidden");
    }

    return { totalPending, deliveryPct };
  }

  async function saveDraft() {
    const data = collectFormData();
    if (!data.date || !data.officeId) {
      UI.toast("Select a date and office before saving a draft.", "warning");
      return;
    }
    await Storage.saveDraft(data.date, data.officeId, data);
    UI.toast("Draft saved on this device.", "success");
    setSyncStatus("draft");
  }

  async function handleSubmitClick() {
    const data = collectFormData();
    const { valid, errors } = Validation.validateDailyRecord(data);

    if (!valid) {
      UI.toast(errors[0], "error");
      showErrorList(errors);
      return;
    }
    hideErrorList();

    const { totalPending, deliveryPct } = recalculate();

    const summaryHtml = `
      <div class="summary-grid">
        <div><span>Date</span><b>${UI.toDisplayDate(data.date)}</b></div>
        <div><span>Office</span><b>${data.officeName}</b></div>
        <div><span>Kits Came</span><b>${data.kitsCameToday}</b></div>
        <div><span>Delivered</span><b>${data.kitsDelivered}</b></div>
        <div><span>Redirected</span><b>${data.redirected}</b></div>
        <div><span>Pending</span><b>${totalPending}</b></div>
        <div><span>Delivery %</span><b>${deliveryPct.toFixed(1)}%</b></div>
      </div>
    `;

    const confirmed = await UI.confirmModal("Confirm Submission", summaryHtml, "CONFIRM & SUBMIT");
    if (!confirmed) return;

    await submitRecord(data, totalPending, deliveryPct);
  }

  async function submitRecord(data, totalPending, deliveryPct) {
    const record = {
      id: generateRecordId(data.date, data.officeId),
      ...data,
      totalPending,
      deliveryPercentage: deliveryPct,
      submittedAt: new Date().toISOString()
    };

    setSyncStatus("saving");

    if (!navigator.onLine) {
      await Storage.queueForSync(record);
      await Storage.clearDraft(data.date, data.officeId);
      setSyncStatus("offline-queued");
      UI.toast("You're offline. Saved on device — will sync automatically.", "warning");
      return;
    }

    try {
      const result = await Api.submitDailyRecord(record, Auth.getSession());
      if (result.success) {
        await Storage.clearDraft(data.date, data.officeId);
        setSyncStatus("synced");
        UI.toast(`Submitted successfully. Record ID: ${result.data.recordId}`, "success", 5000);
      } else if (result.code === "DUPLICATE") {
        const proceed = await UI.confirmModal(
          "Record Already Submitted",
          "A record already exists for this office and date. Contact your DPS to authorize an edit.",
          "OK"
        );
      } else {
        UI.toast(result.message || "Submission failed.", "error");
        await Storage.queueForSync(record);
        setSyncStatus("error");
      }
    } catch (err) {
      // Network failed mid-flight — fall back to offline queue, no data loss
      await Storage.queueForSync(record);
      await Storage.clearDraft(data.date, data.officeId);
      setSyncStatus("offline-queued");
      UI.toast("Network issue. Saved on device — will retry automatically.", "warning");
    }
  }

  function generateRecordId(date, officeId) {
    return `${date}_${officeId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function setSyncStatus(status) {
    const el = document.getElementById("sync-status");
    const map = {
      "draft": ["draft", "Saved locally — draft"],
      "saving": ["syncing", "Saving..."],
      "synced": ["synced", "✓ Synced with server"],
      "offline-queued": ["pending", "Saved on device — waiting for sync"],
      "error": ["error", "Sync failed — will retry"]
    };
    const [cls, label] = map[status] || ["", ""];
    el.className = `sync-badge sync-${cls}`;
    el.textContent = label;
  }

  function showErrorList(errors) {
    const el = document.getElementById("form-errors");
    el.innerHTML = errors.map(e => `<li>${e}</li>`).join("");
    el.classList.remove("hidden");
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function hideErrorList() {
    document.getElementById("form-errors").classList.add("hidden");
  }

  return { init, recalculate };
})();
