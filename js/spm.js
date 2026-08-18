const SPM = (() => {
  let initialized = false;
  let office = null;
  let todayRecord = null;

  const ids = [
    "all-kits","similar-article",
    "invalid-mobile-kits","deliverable-kits","incomplete-kits","without-proper-details-kits",
    "invalid-mobile-articles","deliverable-articles","incomplete-articles","without-proper-details-articles"
  ];

  const map = {
    "all-kits":"allKits",
    "similar-article":"similarArticle",
    "invalid-mobile-kits":"invalidMobileKits",
    "deliverable-kits":"deliverableKits",
    "incomplete-kits":"incompleteKits",
    "without-proper-details-kits":"withoutProperDetailsKits",
    "invalid-mobile-articles":"invalidMobileArticles",
    "deliverable-articles":"deliverableArticles",
    "incomplete-articles":"incompleteArticles",
    "without-proper-details-articles":"withoutProperDetailsArticles"
  };

  function val(id) {
    const n = Number(document.getElementById(id)?.value || 0);
    return Number.isInteger(n) && n >= 0 ? n : 0;
  }

  function data() {
    const s = Auth.getSession();
    return {
      id: todayRecord?.id || (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
      date: document.getElementById("spm-date").value,
      officeId: office?.officeId || s?.officeId || "",
      officeName: office?.officeName || s?.officeName || "",
      spmId: s?.userId || "",
      spmName: s?.name || "",
      allKits: val("all-kits"),
      similarArticle: val("similar-article"),
      invalidMobileKits: val("invalid-mobile-kits"),
      deliverableKits: val("deliverable-kits"),
      incompleteKits: val("incomplete-kits"),
      withoutProperDetailsKits: val("without-proper-details-kits"),
      invalidMobileArticles: val("invalid-mobile-articles"),
      deliverableArticles: val("deliverable-articles"),
      incompleteArticles: val("incomplete-articles"),
      withoutProperDetailsArticles: val("without-proper-details-articles")
    };
  }

  function setOffice(x) {
    office = x;
    const el = document.getElementById("spm-office");
    if (!el || !x) return;
    el.innerHTML = "";
    const o = document.createElement("option");
    o.value = x.officeId;
    o.textContent = x.officeName;
    o.selected = true;
    el.appendChild(o);
    el.disabled = true;
  }

  function fill(r) {
    ids.forEach(id => {
      const key = map[id];
      const el = document.getElementById(id);
      if (el) { el.value = r[key] ?? 0; el.disabled = true; }
    });
    document.getElementById("btn-submit").disabled = true;
    recalculate();
  }

  function clear() {
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.value = 0; el.disabled = false; }
    });
    document.getElementById("btn-submit").disabled = false;
    todayRecord = null;
    recalculate();
  }

  function notice(text, cls) {
    const el = document.getElementById("spm-update-notification");
    if (!el) return;
    el.className = cls || "";
    el.textContent = text || "";
  }

  async function loadOffice() {
    const s = Auth.getSession();
    if (!s) return;
    try {
      const r = await Api.getUser(s.userId);
      if (!r.success) throw new Error(r.message || "Unable to load office.");
      setOffice({officeId: String(r.data.officeId), officeName: String(r.data.officeName)});
      s.officeId = String(r.data.officeId);
      s.officeName = String(r.data.officeName);
      s.name = r.data.name || s.name;
      await Auth.setSession(s);
    } catch (e) {
      const el = document.getElementById("spm-office");
      if (el) { el.innerHTML = '<option value="">Office unavailable</option>'; el.disabled = true; }
      notice(e.message, "spm-notify-warning");
    }
  }

  async function refreshToday() {
    try {
      const r = await Api.getOwnTodayRecord();
      todayRecord = r.success ? r.data : null;
      if (todayRecord) {
        fill(todayRecord);
        notice("Today's report is already submitted. Duplicate submission is blocked.", "spm-notify-complete");
      } else {
        notice("Today's report has not been submitted yet.", "spm-notify-pending");
        clear();
      }
    } catch (e) {
      notice(e.message || "Unable to verify today's submission.", "spm-notify-warning");
    }
  }

  function recalculate() {
    const r = data();
    const kc = Calculations.kitCheck(r);
    const ac = Calculations.articleCheck(r);
    document.getElementById("summary-deliverable-kits").textContent = r.deliverableKits;
    document.getElementById("summary-incomplete-kits").textContent = r.incompleteKits;
    document.getElementById("summary-kit-check").textContent = `${kc.categories} / ${kc.total}`;
    document.getElementById("summary-article-check").textContent = `${ac.categories} / ${ac.total}`;
  }

  async function submit() {
    const r = data();
    const v = Validation.validateDailyRecord(r);
    if (!v.valid) {
      notice(v.errors[0], "spm-notify-warning");
      return;
    }

    const b = document.getElementById("btn-submit");
    b.disabled = true;

    try {
      const result = await Api.submitDailyRecord(r, Auth.getSession());
      if (!result.success) throw new Error(result.message || "Submission failed.");
      notice(result.message || "Report submitted successfully.", "spm-notify-complete");
      todayRecord = { ...r, id: result.data?.recordId || r.id };
      fill(todayRecord);
      UI.toast("PMV Toolkit report submitted.", "success");
    } catch (e) {
      notice(e.message || "Submission failed.", "spm-notify-warning");
      b.disabled = false;
    }
  }

  async function saveDraft() {
    const r = data();
    try {
      await Storage.saveDraft(r.date, r.officeId, r);
      UI.toast("Draft saved on this device.", "success");
    } catch (e) {
      UI.toast(e.message || "Unable to save draft.", "error");
    }
  }

  function bind() {
    document.getElementById("spm-form").addEventListener("input", recalculate);
    document.getElementById("btn-submit").onclick = submit;
    document.getElementById("btn-save-draft").onclick = saveDraft;
    document.getElementById("spm-date").onchange = refreshToday;
  }

  async function init() {
    if (initialized) return;
    initialized = true;
    const s = Auth.getSession();
    if (!s) return;

    const d = document.getElementById("spm-date");
    d.value = UI.todayISO();
    d.max = UI.todayISO();

    setOffice({
      officeId: String(s.officeId || ""),
      officeName: String(s.officeName || "")
    });
    await loadOffice();
    bind();
    await refreshToday();
    recalculate();
  }

  return { init, recalculate };
})();
