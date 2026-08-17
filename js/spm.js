const SPM = (() => {

  let office = null;
  let todayRecord = null;
  let initialized = false;

  const OFFICE_CACHE_KEY = "pmv_user_office";


  // =========================================================
  // INITIALIZE
  // =========================================================

  async function init() {

    if (initialized) return;

    initialized = true;

    const s = Auth.getSession();

    if (!s) return;

    const d = document.getElementById("spm-date");

    if (!d) {
      throw new Error("Daily Entry form is missing.");
    }

    d.value = UI.todayISO();
    d.max = UI.todayISO();


    // ---------------------------------------------------------
    // IMPORTANT:
    // Load cached/session office FIRST.
    // Do not wait for Google Apps Script.
    // ---------------------------------------------------------

    const immediateOffice = getImmediateOffice(s);

    if (immediateOffice) {

      setOffice(immediateOffice);

    } else {

      showOfficeLoading();

    }


    // ---------------------------------------------------------
    // Then verify office from server
    // ---------------------------------------------------------

    try {

      await loadUser(s);

    } catch (e) {

      console.error("Office loading error:", e);

      // Do NOT leave "Loading Office..."
      if (!office) {
        showOfficeError();
      }

      UI.toast(
        e.message || "Could not load office information.",
        "error"
      );
    }


    bind();

    await refreshTodayStatus();

    await loadPrevious();

    recalculate();
  }


  // =========================================================
  // GET OFFICE IMMEDIATELY FROM SESSION / CACHE
  // =========================================================

  function getImmediateOffice(s) {

    // First preference: current login session

    if (
      s &&
      s.officeId &&
      s.officeName
    ) {

      return {
        officeId: String(s.officeId).trim(),
        officeName: String(s.officeName).trim()
      };

    }


    // Second preference: local cache

    try {

      const cached =
        localStorage.getItem(OFFICE_CACHE_KEY);

      if (cached) {

        const parsed = JSON.parse(cached);

        if (
          parsed &&
          parsed.officeId &&
          parsed.officeName
        ) {

          return {
            officeId: String(parsed.officeId).trim(),
            officeName: String(parsed.officeName).trim()
          };

        }
      }

    } catch (e) {

      console.warn(
        "Office cache read failed:",
        e
      );

    }

    return null;
  }


  // =========================================================
  // SET OFFICE IN UI
  // =========================================================

  function setOffice(data) {

    if (
      !data ||
      !data.officeId ||
      !data.officeName
    ) {
      return;
    }

    office = {
      officeId: String(data.officeId).trim(),
      officeName: String(data.officeName).trim()
    };


    const e =
      document.getElementById("spm-office");

    if (!e) return;


    e.innerHTML = "";

    const option =
      document.createElement("option");

    option.value = office.officeId;

    option.textContent =
      office.officeName;

    option.selected = true;

    e.appendChild(option);

    e.value = office.officeId;

    e.disabled = true;

    e.setAttribute(
      "aria-disabled",
      "true"
    );


    // Save session

    const s = Auth.getSession();

    if (s) {

      s.officeId =
        office.officeId;

      s.officeName =
        office.officeName;

      Auth.setSession(s).catch(
        console.error
      );
    }


    // Save local cache

    try {

      localStorage.setItem(
        OFFICE_CACHE_KEY,
        JSON.stringify(office)
      );

    } catch (e) {

      console.warn(
        "Could not cache office:",
        e
      );
    }
  }


  // =========================================================
  // LOADING STATE
  // =========================================================

  function showOfficeLoading() {

    const e =
      document.getElementById("spm-office");

    if (!e) return;

    e.innerHTML =
      '<option value="">Loading Office…</option>';

    e.disabled = true;
  }


  // =========================================================
  // ERROR STATE
  // =========================================================

  function showOfficeError() {

    const e =
      document.getElementById("spm-office");

    if (!e) return;

    e.innerHTML =
      '<option value="">Office unavailable</option>';

    e.disabled = true;
  }


  // =========================================================
  // LOAD USER FROM SERVER
  // =========================================================

  async function loadUser(s) {

    const r =
      await Api.getUser(s.userId);


    if (!r.success) {

      throw new Error(
        r.message ||
        "Could not load user."
      );
    }


    const officeId =
      String(
        r.data?.officeId || ""
      ).trim();

    const officeName =
      String(
        r.data?.officeName || ""
      ).trim();


    if (!officeId || !officeName) {

      throw new Error(
        "Your office is not configured in USER_MASTER."
      );
    }


    // Update UI immediately after server verification

    setOffice({
      officeId,
      officeName
    });


    // Update session information

    s.officeId = officeId;

    s.officeName = officeName;

    s.name =
      r.data.name ||
      s.name;

    s.role =
      r.data.role ||
      s.role;


    await Auth.setSession(s);
  }


  // =========================================================
  // EVENT BINDING
  // =========================================================

  function bind() {

    document
      .getElementById("spm-date")
      .addEventListener(
        "change",
        async () => {

          await refreshTodayStatus();

          await loadPrevious();

          recalculate();
        }
      );


    document
      .getElementById("spm-form")
      .addEventListener(
        "input",
        recalculate
      );


    document
      .getElementById("add-incomplete-set")
      .onclick = () =>
        addRow("incomplete");


    document
      .getElementById("add-complete-set")
      .onclick = () =>
        addRow("complete");


    document
      .getElementById("btn-save-draft")
      .onclick = saveDraft;


    document
      .getElementById("btn-submit")
      .onclick = submit;
  }


  // =========================================================
  // TODAY STATUS
  // =========================================================

  async function refreshTodayStatus() {

    if (
      UI.todayISO() !==
      document.getElementById("spm-date").value
    ) {
      return;
    }


    try {

      const r =
        await Api.getOwnTodayRecord();

      todayRecord =
        r.success
          ? r.data
          : null;

      renderNotice();

    } catch (e) {

      renderNotice(
        e.message ||
        "Could not verify today's submission."
      );
    }
  }


  // =========================================================
  // NOTIFICATION
  // =========================================================

  function renderNotice(error) {

    const b =
      document.getElementById(
        "spm-update-notification"
      );

    if (!b) return;


    if (error) {

      b.className =
        "spm-notify-warning";

      b.textContent = error;

      return;
    }


    if (!todayRecord) {

      b.className =
        "spm-notify-pending";

      b.innerHTML =
        "<strong>Update Pending</strong>" +
        "<span>Today's PMV Toolkit information has not been updated yet.</span>";

      return;
    }


    b.className =
      "spm-notify-complete";

    b.innerHTML =
      "<strong>Today's update is submitted.</strong>" +
      "<button type='button' id='spm-delete-today-now'>" +
      "DELETE TODAY'S ENTRY" +
      "</button>";


    document
      .getElementById(
        "spm-delete-today-now"
      )
      .onclick = deleteToday;
  }


  // =========================================================
  // DELETE TODAY
  // =========================================================

  async function deleteToday() {

    if (!todayRecord) return;


    if (
      !await UI.confirmModal(
        "Delete Today's Entry",
        "This deletes all of your PMV rows for today. You can submit again after deletion.",
        "DELETE TODAY"
      )
    ) {
      return;
    }


    try {

      const r =
        await Api.deleteOwnTodayRecord(
          todayRecord.id
        );


      if (!r.success) {

        UI.toast(
          r.message ||
          "Delete failed",
          "error"
        );

        return;
      }


      todayRecord = null;

      renderNotice();

      UI.toast(
        "Today's entry deleted. You can submit a corrected entry now.",
        "success"
      );

    } catch (e) {

      UI.toast(
        e.message ||
        "Delete failed.",
        "error"
      );
    }
  }


  // =========================================================
  // PREVIOUS DAY
  // =========================================================

  async function loadPrevious() {

    const d =
      document.getElementById(
        "spm-date"
      ).value;


    if (!office || !d) return;


    try {

      const r =
        await Api.getPreviousDay(
          office.officeId,
          d
        );


      const x =
        r.success
          ? r.data
          : null;


      UI.setText(
        "prev-came",
        x?.kitsCameToday ?? "—"
      );

      UI.setText(
        "prev-delivered",
        x?.kitsDelivered ?? "—"
      );

      UI.setText(
        "prev-redirected",
        x?.redirected ?? "—"
      );

      UI.setText(
        "prev-pending",
        x?.currentPending ?? "—"
      );

    } catch (_) {

      UI.setText(
        "prev-came",
        "—"
      );

      UI.setText(
        "prev-delivered",
        "—"
      );

      UI.setText(
        "prev-redirected",
        "—"
      );

      UI.setText(
        "prev-pending",
        "—"
      );
    }
  }


  // =========================================================
  // ADD SET
  // =========================================================

  function addRow(kind) {

    const incomplete =
      kind === "incomplete";

    const c =
      document.getElementById(
        incomplete
          ? "incomplete-rows"
          : "complete-rows"
      );

    const q =
      incomplete
        ? "kitsIncomplete"
        : "kitsComplete";


    const r =
      document.createElement("div");

    r.className = "set-row";


    const n =
      c.children.length + 1;


    r.innerHTML =
      `<b>Set ${n}</b>` +

      `<label>Set Number
        <input
          type="number"
          min="0"
          class="set-number">
      </label>` +

      `<label>
        ${incomplete
          ? "Kits Incomplete"
          : "Kits Complete"}
        <input
          type="number"
          min="0"
          class="${q}"
          value="0">
      </label>`;


    c.appendChild(r);
  }


  // =========================================================
  // ROW DATA
  // =========================================================

  function rows(kind) {

    const incomplete =
      kind === "incomplete";


    const c =
      document.getElementById(
        incomplete
          ? "incomplete-rows"
          : "complete-rows"
      );


    const q =
      incomplete
        ? "kitsIncomplete"
        : "kitsComplete";


    return [
      ...c.querySelectorAll(
        ".set-row"
      )
    ].map(r => ({

      setNumber:
        r.querySelector(
          ".set-number"
        )?.value || "",

      [q]:
        r.querySelector(
          "." + q
        )?.value || 0

    }));
  }


  // =========================================================
  // VALUE
  // =========================================================

  function v(id) {

    return (
      document.getElementById(id)?.value ||
      "0"
    );
  }


  // =========================================================
  // DAILY DATA
  // =========================================================

  function data() {

    const s =
      Auth.getSession();


    return {

      date:
        document.getElementById(
          "spm-date"
        ).value,

      officeId:
        office?.officeId ||
        s?.officeId ||
        "",

      officeName:
        office?.officeName ||
        s?.officeName ||
        "",

      spmId:
        s?.userId || "",

      spmName:
        s?.name || "",

      kitsCameToday:
        v("kits-came"),

      kitsDelivered:
        v("kits-delivered"),

      redirected:
        v("redirected"),

      mobileInvalid:
        v("mobile-invalid"),

      addressNotFound:
        v("address-not-found"),

      torn:
        v("torn-condition"),

      incompleteRows:
        rows("incomplete"),

      completeRows:
        rows("complete")
    };
  }


  // =========================================================
  // CALCULATE
  // =========================================================

  function recalculate() {

    const d = data();

    const p =
      Calculations.calculateTotalPending(d);

    const pct =
      Calculations.calculateDeliveryPercent(
        d.kitsDelivered,
        d.kitsCameToday
      );


    UI.setText(
      "total-incomplete",
      Calculations.sumIncompleteKits(
        d.incompleteRows
      )
    );


    UI.setText(
      "total-complete",
      Calculations.sumCompleteKits(
        d.completeRows
      )
    );


    UI.setText(
      "total-pending",
      p
    );


    UI.setText(
      "delivery-percent",
      pct.toFixed(1) + "%"
    );


    return {
      totalPending: p,
      deliveryPct: pct
    };
  }


  // =========================================================
  // SAVE DRAFT
  // =========================================================

  async function saveDraft() {

    const d = data();

    await Storage.saveDraft(
      d.date,
      d.officeId,
      d
    );

    UI.toast(
      "Draft saved on this device.",
      "success"
    );
  }


  // =========================================================
  // SUBMIT
  // =========================================================

  async function submit() {

    const d = data();


    const validation =
      Validation.validateDailyRecord(d);


    if (!validation.valid) {

      UI.toast(
        validation.errors[0],
        "error"
      );

      return;
    }


    const t =
      recalculate();


    if (
      !await UI.confirmModal(

        "Confirm Submission",

        `Office: <b>${escapeHtml(
          d.officeName
        )}</b><br>` +

        `Pending: <b>${t.totalPending}</b><br>` +

        `Delivery: <b>${t.deliveryPct.toFixed(
          1
        )}%</b>`,

        "CONFIRM"
      )
    ) {
      return;
    }


    const r = {

      id:
        `${d.date}_${d.officeId}_${
          crypto.randomUUID?.() ||
          Date.now()
        }`,

      ...d,

      totalPending:
        t.totalPending,

      deliveryPercentage:
        t.deliveryPct,

      submittedAt:
        new Date().toISOString()
    };


    try {

      const x =
        await Api.submitDailyRecord(
          r,
          Auth.getSession()
        );


      if (x.success) {

        await Storage.clearDraft(
          d.date,
          d.officeId
        );

        await refreshTodayStatus();

        UI.toast(
          "Update submitted successfully.",
          "success"
        );

      } else {

        UI.toast(
          x.message ||
          "Submission rejected.",
          "error"
        );
      }

    } catch (e) {

      UI.toast(
        e.message ||
        "Submission failed.",
        "error"
      );
    }
  }


  // =========================================================
  // HTML ESCAPE
  // =========================================================

  function escapeHtml(s) {

    return String(s || "")
      .replace(
        /[&<>"']/g,
        c => ({

          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;"

        }[c])
      );
  }


  return {
    init,
    recalculate
  };

})();
