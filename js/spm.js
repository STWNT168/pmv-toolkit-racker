const SPM = (() => {
  let office = null;
  let todayRecord = null;
  let initialized = false;

  async function init() {
    if (initialized) return;
    initialized = true;

    const s = Auth.getSession();
    if (!s) return;

    const d = document.getElementById("spm-date");
    if (!d) throw new Error("Daily Entry form is missing.");

    d.value = UI.todayISO();
    d.max = UI.todayISO();

    await loadUser(s);
    bind();
    await refreshTodayStatus();
    await loadPrevious();
    recalculate();
  }

  // SPM Office comes directly from USER_MASTER via getUser().
  // The office selector is deliberately locked.
  async function loadUser(s) {
    const r = await Api.getUser(s.userId);
    if (!r.success) throw new Error(r.message || "Could not load user.");

    const officeId = String(r.data.officeId || "").trim();
    const officeName = String(r.data.officeName || "").trim();

    if (!officeId || !officeName) {
      throw new Error("Your office is not configured in USER_MASTER.");
    }

    office = {officeId, officeName};

    const e = document.getElementById("spm-office");
    e.innerHTML = "";

    const option = document.createElement("option");
    option.value = office.officeId;
    option.textContent = office.officeName;
    option.selected = true;

    e.appendChild(option);
    e.value = office.officeId;
    e.disabled = true;
    e.setAttribute("aria-disabled","true");

    s.officeId = office.officeId;
    s.officeName = office.officeName;
    s.name = r.data.name || s.name;
    s.role = r.data.role || s.role;

    await Auth.setSession(s);
  }

  function bind() {
    document.getElementById("spm-date").addEventListener("change", async () => {
      await refreshTodayStatus();
      await loadPrevious();
      recalculate();
    });

    document.getElementById("spm-form").addEventListener("input", recalculate);
    document.getElementById("add-incomplete-set").onclick = () => addRow("incomplete");
    document.getElementById("add-complete-set").onclick = () => addRow("complete");
    document.getElementById("btn-save-draft").onclick = saveDraft;
    document.getElementById("btn-submit").onclick = submit;
  }

  async function refreshTodayStatus() {
    if (UI.todayISO() !== document.getElementById("spm-date").value) return;

    try {
      const r = await Api.getOwnTodayRecord();
      todayRecord = r.success ? r.data : null;
      renderNotice();
    } catch (e) {
      renderNotice(e.message || "Could not verify today's submission.");
    }
  }

  function renderNotice(error) {
    const b = document.getElementById("spm-update-notification");
    if (!b) return;

    if (error) {
      b.className = "spm-notify-warning";
      b.textContent = error;
      return;
    }

    if (!todayRecord) {
      b.className = "spm-notify-pending";
      b.innerHTML =
        "<strong>Update Pending</strong>" +
        "<span>Today's PMV Toolkit information has not been updated yet.</span>";
      return;
    }

    b.className = "spm-notify-complete";
    b.innerHTML =
      "<strong>Today's update is submitted.</strong>" +
      "<button type='button' id='spm-delete-today-now'>DELETE TODAY'S ENTRY</button>";

    document.getElementById("spm-delete-today-now").onclick = deleteToday;
  }

  async function deleteToday() {
    if (!todayRecord) return;

    if (!await UI.confirmModal(
      "Delete Today's Entry",
      "This deletes all of your PMV rows for today. You can submit again after deletion.",
      "DELETE TODAY"
    )) return;

    try {
      const r = await Api.deleteOwnTodayRecord(todayRecord.id);

      if (!r.success) {
        UI.toast(r.message || "Delete failed", "error");
        return;
      }

      todayRecord = null;
      renderNotice();
      UI.toast("Today's entry deleted. You can submit a corrected entry now.", "success");
    } catch (e) {
      UI.toast(e.message || "Delete failed.", "error");
    }
  }

  async function loadPrevious() {
    const d = document.getElementById("spm-date").value;
    if (!office || !d) return;

    try {
      const r = await Api.getPreviousDay(office.officeId, d);
      const x = r.success ? r.data : null;

      UI.setText("prev-came", x?.kitsCameToday ?? "—");
      UI.setText("prev-delivered", x?.kitsDelivered ?? "—");
      UI.setText("prev-redirected", x?.redirected ?? "—");
      UI.setText("prev-pending", x?.currentPending ?? "—");
    } catch (_) {
      UI.setText("prev-came", "—");
      UI.setText("prev-delivered", "—");
      UI.setText("prev-redirected", "—");
      UI.setText("prev-pending", "—");
    }
  }

  function addRow(kind) {
    const incomplete = kind === "incomplete";
    const c = document.getElementById(incomplete ? "incomplete-rows" : "complete-rows");
    const q = incomplete ? "kitsIncomplete" : "kitsComplete";

    const r = document.createElement("div");
    r.className = "set-row";
    const n = c.children.length + 1;

    r.innerHTML =
      `<b>Set ${n}</b>` +
      `<label>Set Number<input type="number" min="0" class="set-number"></label>` +
      `<label>${incomplete ? "Kits Incomplete" : "Kits Complete"}<input type="number" min="0" class="${q}" value="0"></label>`;

    c.appendChild(r);
  }

  function rows(kind) {
    const incomplete = kind === "incomplete";
    const c = document.getElementById(incomplete ? "incomplete-rows" : "complete-rows");
    const q = incomplete ? "kitsIncomplete" : "kitsComplete";

    return [...c.querySelectorAll(".set-row")].map(r => ({
      setNumber:r.querySelector(".set-number")?.value || "",
      [q]:r.querySelector("." + q)?.value || 0
    }));
  }

  function v(id) {
    return document.getElementById(id)?.value || "0";
  }

  function data() {
    const s = Auth.getSession();

    return {
      date:document.getElementById("spm-date").value,
      officeId:office?.officeId || s?.officeId || "",
      officeName:office?.officeName || s?.officeName || "",
      spmId:s.userId,
      spmName:s.name,
      kitsCameToday:v("kits-came"),
      kitsDelivered:v("kits-delivered"),
      redirected:v("redirected"),
      mobileInvalid:v("mobile-invalid"),
      addressNotFound:v("address-not-found"),
      torn:v("torn-condition"),
      incompleteRows:rows("incomplete"),
      completeRows:rows("complete")
    };
  }

  function recalculate() {
    const d = data();
    const p = Calculations.calculateTotalPending(d);
    const pct = Calculations.calculateDeliveryPercent(d.kitsDelivered,d.kitsCameToday);

    UI.setText("total-incomplete",Calculations.sumIncompleteKits(d.incompleteRows));
    UI.setText("total-complete",Calculations.sumCompleteKits(d.completeRows));
    UI.setText("total-pending",p);
    UI.setText("delivery-percent",pct.toFixed(1)+"%");

    return {totalPending:p,deliveryPct:pct};
  }

  async function saveDraft() {
    const d = data();
    await Storage.saveDraft(d.date,d.officeId,d);
    UI.toast("Draft saved on this device.","success");
  }

  async function submit() {
    const d = data();
    const v = Validation.validateDailyRecord(d);

    if (!v.valid) {
      UI.toast(v.errors[0],"error");
      return;
    }

    const t = recalculate();

    if (!await UI.confirmModal(
      "Confirm Submission",
      `Office: <b>${escapeHtml(d.officeName)}</b><br>` +
      `Pending: <b>${t.totalPending}</b><br>` +
      `Delivery: <b>${t.deliveryPct.toFixed(1)}%</b>`,
      "CONFIRM"
    )) return;

    const r = {
      id:`${d.date}_${d.officeId}_${crypto.randomUUID?.() || Date.now()}`,
      ...d,
      totalPending:t.totalPending,
      deliveryPercentage:t.deliveryPct,
      submittedAt:new Date().toISOString()
    };

    try {
      const x = await Api.submitDailyRecord(r,Auth.getSession());

      if (x.success) {
        await Storage.clearDraft(d.date,d.officeId);
        await refreshTodayStatus();
        UI.toast("Update submitted successfully.","success");
      } else {
        UI.toast(x.message || "Submission rejected.","error");
      }
    } catch(e) {
      UI.toast(e.message || "Submission failed.","error");
    }
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g,c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[c]));
  }

  return {init,recalculate};
})();
