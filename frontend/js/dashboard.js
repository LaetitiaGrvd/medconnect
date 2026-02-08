(() => {
  const api = window.MC_API;
  const ui = window.MC_UI;
  const API_BASE = api?.API_BASE || "";

  const el = {
    dashName: document.getElementById("dashName"),
    dashRole: document.getElementById("dashRole"),
    dashIntro: document.getElementById("dashIntro"),
    dashSidebarRole: document.getElementById("dashSidebarRole"),
    logoutBtn: document.getElementById("logoutBtn"),
    nav: document.getElementById("dashNav"),
    moduleRoot: document.getElementById("dashModuleRoot"),
    globalLoading: document.getElementById("dashGlobalLoading"),
    globalError: document.getElementById("dashGlobalError"),
    globalEmpty: document.getElementById("dashGlobalEmpty"),
    modal: {
      root: document.getElementById("dashModal"),
      title: document.getElementById("dashModalTitle"),
      body: document.getElementById("dashModalBody"),
      footer: document.getElementById("dashModalFooter"),
    },
  };

  let translations = {};

  function setText(node, value) {
    if (!node) return;
    node.textContent = value == null ? "" : String(value);
  }

  function show(node) {
    if (!node) return;
    node.classList.remove("hidden");
  }

  function hide(node) {
    if (!node) return;
    node.classList.add("hidden");
  }

  function normRole(role) {
    return String(role || "").trim().toLowerCase();
  }

  async function loadTranslations() {
    const lang = localStorage.getItem("lang") || "en";
    try {
      const res = await fetch(`lang/${lang}.json`);
      if (!res.ok) return;
      const data = await res.json();
      if (data && typeof data === "object") translations = data;
    } catch (e) {}
  }

  function t(key, fallback) {
    const value = translations[key];
    if (value != null && String(value).trim()) return String(value);
    return fallback;
  }

  function portalUrl() {
    return "portal.html?returnTo=" + encodeURIComponent("dashboard.html");
  }

  function escapeHtml(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function notify(message, type = "error") {
    if (!message) return;
    if (ui?.toast) {
      ui.toast(message, type);
    } else {
      alert(message);
    }
  }

  async function apiFetch(path, opts = {}) {
    if (!api?.hasBase?.()) {
      const err = new Error("API base URL is not configured.");
      err.code = "API_BASE_MISSING";
      throw err;
    }
    return api.apiFetch(path, opts);
  }

  async function getMe() {
    const res = await apiFetch("/api/me", { method: "GET" });

    if (res.status === 401 || res.status === 403) {
      return { ok: false, unauth: true, data: null };
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { ok: false, unauth: false, data: { error: txt || "Error" } };
    }

    const data = await res.json().catch(() => ({}));
    return { ok: true, unauth: false, data };
  }

  async function doLogout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } catch (e) {}
    window.location.href = "portal.html";
  }

  function bindLogout() {
    if (!el.logoutBtn) return;
    el.logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      doLogout();
    });
  }

  function applyDashboardNavRules(user) {
    const isAuth = !!user;
    const role = normRole(user?.role);

    function setLiVisibleByHref(href, visible) {
      const a = document.querySelector(`.side-menu a[href="${href}"]`);
      const li = a ? a.closest("li") : null;
      if (li) li.classList.toggle("hidden", !visible);
    }

    setLiVisibleByHref("dashboard.html", isAuth);
    setLiVisibleByHref("portal.html", !isAuth);
    setLiVisibleByHref("login.html", !isAuth);

    document.querySelectorAll(".side-menu li[data-roles]").forEach((li) => {
      if (!isAuth) {
        li.classList.add("hidden");
        return;
      }
      const roles = (li.getAttribute("data-roles") || "")
        .split(",")
        .map((r) => r.trim().toLowerCase())
        .filter(Boolean);

      if (!roles.length) {
        li.classList.remove("hidden");
        return;
      }
      li.classList.toggle("hidden", !roles.includes(role));
    });
  }

  function introForRole(role) {
    if (role === "doctor") return t("dashboard_intro_doctor", "Your schedule and patient actions are ready.");
    if (role === "admin") return t("dashboard_intro_admin", "System oversight and management tools are available.");
    return t("dashboard_intro_patient", "Your upcoming appointments and reports are ready.");
  }

  function openModal({ title, body, footer }) {
    if (!el.modal.root) return;
    if (el.modal.title) el.modal.title.textContent = title || "Details";
    if (el.modal.body) el.modal.body.innerHTML = body || "";
    if (el.modal.footer) {
      el.modal.footer.innerHTML =
        footer || '<button type="button" class="btn ghost" data-close="true">Close</button>';
    }

    el.modal.root.classList.remove("hidden");
    el.modal.root.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    if (!el.modal.root) return;
    el.modal.root.classList.add("hidden");
    el.modal.root.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  function bindModal() {
    document.addEventListener("click", (e) => {
      const t = e.target;
      if (!t) return;
      if (t.matches('[data-close="true"]')) {
        closeModal();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }

  function renderNav(role) {
    if (!el.nav) return;
    const items = [];

    if (role === "patient") {
      items.push({ label: t("dashboard_nav_appointments", "Appointments"), target: "patient-appointments" });
      items.push({ label: t("dashboard_nav_reports", "Lab Reports"), target: "patient-reports" });
    } else if (role === "doctor") {
      items.push({ label: t("dashboard_nav_summary", "Summary"), target: "doctor-summary" });
      items.push({ label: t("dashboard_nav_appointments", "Appointments"), target: "doctor-appointments" });
    } else if (role === "admin") {
      items.push({ label: t("dashboard_nav_doctors", "Doctors"), target: "admin-doctors" });
      items.push({ label: t("dashboard_nav_quotes", "Quote Requests"), target: "admin-quotes" });
      items.push({ label: t("dashboard_nav_appointments", "Appointments"), target: "admin-appointments" });
    }

    el.nav.innerHTML = items
      .map(
        (item) =>
          `<li><a href="#${escapeHtml(item.target)}">${escapeHtml(item.label)}</a></li>`
      )
      .join("");
  }

  function sectionEls(root) {
    if (!root) return null;
    return {
      root,
      loading: root.querySelector('[data-role="loading"]'),
      empty: root.querySelector('[data-role="empty"]'),
      error: root.querySelector('[data-role="error"]'),
      tableWrap: root.querySelector('[data-role="table"]'),
      tbody: root.querySelector('[data-role="tbody"]'),
    };
  }

  function setSectionLoading(section) {
    if (!section) return;
    show(section.loading);
    hide(section.error);
    hide(section.empty);
    hide(section.tableWrap);
    if (section.tbody) section.tbody.innerHTML = "";
  }

  function setSectionError(section, message) {
    if (!section) return;
    hide(section.loading);
    hide(section.tableWrap);
    hide(section.empty);
    if (section.error) {
      section.error.textContent = message;
      show(section.error);
    }
  }

  function setSectionEmpty(section, message) {
    if (!section) return;
    hide(section.loading);
    hide(section.tableWrap);
    hide(section.error);
    if (section.empty) {
      section.empty.textContent = message;
      show(section.empty);
    }
  }

  function setSectionTable(section) {
    if (!section) return;
    hide(section.loading);
    hide(section.error);
    hide(section.empty);
    show(section.tableWrap);
  }

  function buildKvRows(rows) {
    return `
      <div class="mc-kv">
        ${rows
          .map(
            ([k, v]) => `
              <div class="mc-kv__k">${escapeHtml(k)}</div>
              <div class="mc-kv__v">${escapeHtml(v)}</div>
            `
          )
          .join("")}
      </div>
    `;
  }

  function initPatientDashboard(user) {
    if (!el.moduleRoot) return;

    el.moduleRoot.innerHTML = `
      <section class="dash-section" id="patient-appointments">
        <div class="dash-section__head">
          <h2>${t("dashboard_appointments", "Appointments")}</h2>
        </div>
        <div class="dash-loading" data-role="loading">${t("loading", "Loading...")}</div>
        <div class="dash-error hidden" data-role="error"></div>
        <div class="dash-empty hidden" data-role="empty">${t("dashboard_no_appointments", "No appointments to display.")}</div>
        <div class="table-wrap hidden" data-role="table">
          <table class="mc-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody data-role="tbody"></tbody>
          </table>
        </div>
      </section>

      <section class="dash-section" id="patient-reports">
        <div class="dash-section__head">
          <h2>${t("dashboard_reports", "Lab Reports")}</h2>
        </div>
        <div class="dash-loading" data-role="loading">${t("loading", "Loading...")}</div>
        <div class="dash-error hidden" data-role="error"></div>
        <div class="dash-empty hidden" data-role="empty">${t("dashboard_no_reports", "No lab reports to display.")}</div>
        <div class="table-wrap hidden" data-role="table">
          <table class="mc-table">
            <thead>
              <tr>
                <th>Uploaded</th>
                <th>Type</th>
                <th>Patient</th>
                <th>File</th>
              </tr>
            </thead>
            <tbody data-role="tbody"></tbody>
          </table>
        </div>
      </section>
    `;

    const apptSection = sectionEls(document.getElementById("patient-appointments"));
    const repSection = sectionEls(document.getElementById("patient-reports"));

    async function cancelAppointment(apptId) {
      const ok = window.confirm(t("confirm_cancel_appt", "Cancel this appointment?"));
      if (!ok) return;

      const res = await apiFetch(`/api/appointments/${encodeURIComponent(apptId)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "cancelled" }),
      });

      if (!res.ok) {
        notify(t("cancel_failed", "Unable to cancel appointment."));
        return;
      }

      notify(t("cancel_success", "Appointment cancelled."), "success");
      await loadAppointments();
    }

    function canCancelStatus(status) {
      const s = String(status || "").trim().toLowerCase();
      return s === "booked" || s === "confirmed";
    }

    function renderAppointments(items, role) {
      if (!Array.isArray(items) || items.length === 0) {
        setSectionEmpty(apptSection, t("dashboard_no_appointments", "No appointments to display."));
        return;
      }

      setSectionTable(apptSection);

      const rows = items.map((a) => {
        const date = a.date || "";
        const time = a.time || "";
        const name = a.name || "";
        const phone = a.phone || "";
        const status = a.status || a.state || "scheduled";
        const statusNorm = String(status || "").trim().toLowerCase();

        const safeAppt = {
          id: a.id ?? null,
          status,
          specialty: a.specialty || "",
          doctor: a.doctor || a.doctor_name || "",
          date,
          time,
          name,
          phone,
          email: a.email || "",
        };

        const canCancel =
          !!safeAppt.id &&
          canCancelStatus(statusNorm) &&
          ["patient", "doctor", "admin"].includes(normRole(role));

        const action = `
          <button type="button"
            class="btn ghost"
            data-action="view"
            data-appt='${escapeHtml(JSON.stringify(safeAppt))}'
            style="padding:8px 12px; border-width:1px;">
            View
          </button>
          ${
            canCancel
              ? `
                <button type="button"
                  class="btn ghost"
                  data-action="cancel"
                  data-appt-id="${escapeHtml(String(safeAppt.id))}"
                  style="padding:8px 12px; border-width:1px; margin-left:6px;">
                  Cancel
                </button>
              `
              : ""
          }
        `;

        const statusClass = `mc-status mc-status--${escapeHtml(statusNorm || "unknown")}`;

        return `
          <tr>
            <td>${escapeHtml(date)}</td>
            <td>${escapeHtml(time)}</td>
            <td>${escapeHtml(name)}</td>
            <td>${escapeHtml(phone)}</td>
            <td><span class="${statusClass}">${escapeHtml(status)}</span></td>
            <td>${action}</td>
          </tr>
        `;
      });

      apptSection.tbody.innerHTML = rows.join("");
    }

    function renderReports(items) {
      if (!Array.isArray(items) || items.length === 0) {
        setSectionEmpty(repSection, t("dashboard_no_reports", "No lab reports to display."));
        return;
      }

      setSectionTable(repSection);

      const rows = items.map((r) => {
        const uploaded = r.uploaded || r.created_at || "";
        const type = r.type || r.category || "";
        const patient = r.patient || r.patient_name || "";
        const fileUrl = r.url || r.file_url || "";

        const link =
          fileUrl
            ? `<a href="${escapeHtml(fileUrl)}" class="btn ghost" style="padding:8px 12px; border-width:1px;" target="_blank" rel="noopener">Open</a>`
            : `<span>--</span>`;

        return `
          <tr>
            <td>${escapeHtml(uploaded)}</td>
            <td>${escapeHtml(type)}</td>
            <td>${escapeHtml(patient)}</td>
            <td>${link}</td>
          </tr>
        `;
      });

      repSection.tbody.innerHTML = rows.join("");
    }

    async function loadAppointments() {
      setSectionLoading(apptSection);

      const role = normRole(user.role);
      const doctorId = user.doctor_id;
      const patientId = user.patient_id;
      const email = user.email;

      const candidates = [];

      if (role === "doctor" && doctorId != null) {
        candidates.push(`/api/appointments?doctor_id=${encodeURIComponent(doctorId)}`);
      }
      if (role === "patient" && patientId != null) {
        candidates.push(`/api/appointments?patient_id=${encodeURIComponent(patientId)}`);
      }
      if (email) {
        candidates.push(`/api/appointments?email=${encodeURIComponent(email)}`);
      }
      candidates.push(`/api/appointments`);

      let payload = null;
      for (const url of candidates) {
        const res = await apiFetch(url, { method: "GET" });
        if (!res.ok) continue;
        payload = await res.json().catch(() => null);
        if (payload) break;
      }

      if (!payload) {
        setSectionError(apptSection, t("dashboard_load_appointments_error", "Unable to load appointments."));
        return;
      }

      const items = payload?.data?.items || payload?.items || payload?.data || payload || [];
      renderAppointments(items, role);
    }

    async function loadReports() {
      setSectionLoading(repSection);

      const role = normRole(user.role);
      const patientId = user.patient_id;
      const doctorId = user.doctor_id;

      const candidates = [];

      if (role === "patient" && patientId != null) {
        candidates.push(`/api/reports?patient_id=${encodeURIComponent(patientId)}`);
      }
      if (role === "doctor" && doctorId != null) {
        candidates.push(`/api/reports?doctor_id=${encodeURIComponent(doctorId)}`);
      }
      candidates.push(`/api/reports`);

      let payload = null;

      for (const url of candidates) {
        const res = await apiFetch(url, { method: "GET" });
        if (!res.ok) continue;
        payload = await res.json().catch(() => null);
        if (payload) break;
      }

      if (!payload) {
        setSectionError(repSection, t("dashboard_load_reports_error", "Unable to load lab reports."));
        return;
      }

      const items = payload?.data?.items || payload?.items || payload?.data || payload || [];
      renderReports(items);
    }

    el.moduleRoot.addEventListener("click", (e) => {
      const target = e.target;
      if (!target) return;

      const viewBtn = target.closest && target.closest("[data-action='view']");
      if (viewBtn) {
        const raw = viewBtn.getAttribute("data-appt");
        if (!raw) return;
        try {
          const appt = JSON.parse(raw);
          const rows = [
            ["Status", appt.status || appt.state || "scheduled"],
            ["Specialty", appt.specialty || ""],
            ["Doctor", appt.doctor || appt.doctor_name || ""],
            ["Date", appt.date || ""],
            ["Time", appt.time || ""],
            ["Name", appt.name || ""],
            ["Phone", appt.phone || ""],
            ["Email", appt.email || ""],
            ["Appointment ID", appt.id ?? ""],
          ].filter(([, v]) => String(v || "").trim());

          openModal({ title: t("dashboard_appt_details", "Appointment details"), body: buildKvRows(rows) });
        } catch (err) {}
        return;
      }

      const cancelBtn = target.closest && target.closest("[data-action='cancel']");
      if (cancelBtn) {
        const id = cancelBtn.getAttribute("data-appt-id");
        if (id) cancelAppointment(id);
      }
    });

    loadAppointments();
    loadReports();
  }

  async function init() {
    bindLogout();
    bindModal();
    await loadTranslations();

    if (!api?.hasBase?.()) {
      hide(el.globalLoading);
      if (el.globalError) {
        el.globalError.textContent = t(
          "api_missing",
          "Service is temporarily unavailable."
        );
        show(el.globalError);
      }
      return;
    }

    if (el.dashIntro) el.dashIntro.textContent = t("dashboard_intro", "Loading your dashboard...");
    show(el.globalLoading);
    hide(el.globalError);
    hide(el.globalEmpty);

    const me = await getMe();

    if (me.unauth) {
      window.location.href = portalUrl();
      return;
    }

    if (!me.ok || !me.data || me.data.success !== true || !me.data.data?.user) {
      hide(el.globalLoading);
      if (el.globalError) {
        el.globalError.textContent = t("dashboard_load_error", "We could not load your dashboard. Please log in again.");
        show(el.globalError);
      }
      setTimeout(() => {
        window.location.href = portalUrl();
      }, 900);
      return;
    }

    const user = me.data.data.user;
    const name = user.name || user.email || "User";
    const role = normRole(user.role) || "patient";

    setText(el.dashName, name);
    setText(el.dashRole, role);
    if (el.dashSidebarRole) el.dashSidebarRole.textContent = role;

    applyDashboardNavRules(user);
    renderNav(role);

    if (el.dashIntro) el.dashIntro.textContent = introForRole(role);

    hide(el.globalLoading);
    hide(el.globalError);
    hide(el.globalEmpty);

    const ctx = {
      user,
      apiBase: API_BASE,
      el: {
        moduleRoot: el.moduleRoot,
        modal: el.modal,
        openModal,
        closeModal,
      },
    };

    if (role === "doctor" && window.DashboardsDoctor?.initDashboard) {
      window.DashboardsDoctor.initDashboard(ctx);
      return;
    }

    if (role === "admin" && window.DashboardsAdmin?.initDashboard) {
      window.DashboardsAdmin.initDashboard(ctx);
      return;
    }

    initPatientDashboard(user);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
