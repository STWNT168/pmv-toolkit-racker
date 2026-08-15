/**
 * ui.js
 * Small shared UI helpers: toast notifications, confirm modal, date formatting.
 * Kept separate so spm.js / dashboard.js stay focused on their own logic.
 */

const UI = (() => {

  function toast(message, type = "info", durationMs = 3500) {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.textContent = message;
    container.appendChild(el);

    requestAnimationFrame(() => el.classList.add("toast-show"));

    setTimeout(() => {
      el.classList.remove("toast-show");
      setTimeout(() => el.remove(), 300);
    }, durationMs);
  }

  /**
   * Shows a confirm modal and resolves true/false based on user choice.
   * @param {string} title
   * @param {string|HTMLElement} bodyContent
   * @param {string} confirmLabel
   */
  function confirmModal(title, bodyContent, confirmLabel = "CONFIRM") {
    return new Promise((resolve) => {
      const backdrop = document.getElementById("modal-backdrop");
      const modal = document.getElementById("modal");
      modal.innerHTML = "";

      const h = document.createElement("h3");
      h.textContent = title;
      modal.appendChild(h);

      const body = document.createElement("div");
      body.className = "modal-body";
      if (typeof bodyContent === "string") body.innerHTML = bodyContent;
      else body.appendChild(bodyContent);
      modal.appendChild(body);

      const actions = document.createElement("div");
      actions.className = "modal-actions";

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "btn btn-secondary";
      cancelBtn.textContent = "CANCEL";
      cancelBtn.onclick = () => { close(); resolve(false); };

      const confirmBtn = document.createElement("button");
      confirmBtn.className = "btn btn-primary";
      confirmBtn.textContent = confirmLabel;
      confirmBtn.onclick = () => { close(); resolve(true); };

      actions.appendChild(cancelBtn);
      actions.appendChild(confirmBtn);
      modal.appendChild(actions);

      function close() {
        backdrop.classList.add("hidden");
      }

      backdrop.classList.remove("hidden");
    });
  }

  function todayISO() {
    const d = new Date();
    return formatISO(d);
  }

  function formatISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  /** yyyy-mm-dd -> dd-mm-yyyy for display */
  function toDisplayDate(isoDate) {
    if (!isoDate) return "";
    const [y, m, d] = isoDate.split("-");
    return `${d}-${m}-${y}`;
  }

  function previousDateISO(isoDate) {
    const d = new Date(isoDate + "T00:00:00");
    d.setDate(d.getDate() - 1);
    return formatISO(d);
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function show(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove("hidden");
  }

  function hide(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  }

  return { toast, confirmModal, todayISO, formatISO, toDisplayDate, previousDateISO, setText, show, hide };
})();
