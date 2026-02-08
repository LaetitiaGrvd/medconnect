(() => {
  const STATUS_OPTIONS = ["booked", "confirmed", "cancelled", "completed"];
  const DAY_LABELS = {
    mon: "Mon",
    tue: "Tue",
    wed: "Wed",
    thu: "Thu",
    fri: "Fri",
    sat: "Sat",
    sun: "Sun",
  };
  const DAYS = Object.keys(DAY_LABELS);

  function escapeHtml(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function show(node) {
    if (!node) return;
    node.classList.remove("hidden");
  }

  function hide(node) {
    if (!node) return;
    node.classList.add("hidden");
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

  function initDashboard({ user, apiBase, el }) {
    if (!el?.moduleRoot) return;

    const apiFetch = (path, opts = {}) =>
      fetch(`${apiBase}${path}`, {
        ...opts,
        headers: {
          "Content-Type": "application/json",
          ...(opts.headers || {}),
        },
        cache: "no-store",
        credentials: "include",
      });

    el.moduleRoot.innerHTML = `
      <section class="dash-section" id="admin-doctors">
        <div class="dash-section__head">
          <h2>Doctors</h2>
          <div class="dash-inline">
            <button class="btn ghost" id="adminViewCredentialsBtn" disabled>View last generated credentials</button>
            <button class="btn primary" id="adminAddDoctorBtn">Add Doctor</button>
          </div>
        </div>
        <div class="dash-loading" data-role="loading">Loading...</div>
        <div class="dash-error hidden" data-role="error"></div>
        <div class="dash-empty hidden" data-role="empty">No doctors found.</div>
        <div class="table-wrap hidden" data-role="table">
          <table class="mc-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Specialty</th>
                <th>Email</th>
                <th>Status</th>
                <th>Availability</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody data-role="tbody"></tbody>
          </table>
        </div>
      </section>

      <section class="dash-section" id="admin-quotes"></section>

      <section class="dash-section" id="admin-appointments">
        <div class="dash-section__head">
          <h2>Appointments</h2>
          <div class="dash-filters">
            <label>
              Status
              <select id="adminApptStatus">
                <option value="">All</option>
                ${STATUS_OPTIONS.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("")}
              </select>
            </label>
            <label>
              Doctor
              <select id="adminApptDoctor">
                <option value="">All</option>
              </select>
            </label>
            <label>
              From
              <input type="date" id="adminApptFrom" />
            </label>
            <label>
              To
              <input type="date" id="adminApptTo" />
            </label>
            <button class="btn ghost" id="adminApptClear">Clear</button>
            <button class="btn ghost" id="adminApptExport">Export CSV</button>
          </div>
        </div>
        <div class="dash-loading" data-role="loading">Loading...</div>
        <div class="dash-error hidden" data-role="error"></div>
        <div class="dash-empty hidden" data-role="empty">No appointments found.</div>
        <div class="table-wrap hidden" data-role="table">
          <table class="mc-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Patient</th>
                <th>Doctor</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody data-role="tbody"></tbody>
          </table>
        </div>
      </section>
    `;

    const doctorsSection = sectionEls(document.getElementById("admin-doctors"));
    const quoteSection = document.getElementById("admin-quotes");
    const apptSection = sectionEls(document.getElementById("admin-appointments"));

    const addDoctorBtn = document.getElementById("adminAddDoctorBtn");
    const viewCredsBtn = document.getElementById("adminViewCredentialsBtn");
    const apptStatusFilter = document.getElementById("adminApptStatus");
    const apptDoctorFilter = document.getElementById("adminApptDoctor");
    const apptFrom = document.getElementById("adminApptFrom");
    const apptTo = document.getElementById("adminApptTo");
    const apptClear = document.getElementById("adminApptClear");
    const apptExport = document.getElementById("adminApptExport");

    const state = {
      doctors: [],
      appointments: [],
      apptMap: new Map(),
    };

    const CREDENTIALS_KEY = "mc_admin_last_doctor_credentials";
    try {
      sessionStorage.removeItem(CREDENTIALS_KEY);
    } catch (e) {}

    function readStoredCredentials() {
      try {
        const raw = sessionStorage.getItem(CREDENTIALS_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.email || !parsed.password) return null;
        return parsed;
      } catch (e) {
        return null;
      }
    }

    function storeCredentials(creds) {
      if (!creds || !creds.email || !creds.password) return;
      try {
        sessionStorage.setItem(CREDENTIALS_KEY, JSON.stringify(creds));
      } catch (e) {}
      updateCredentialsButton();
    }

    function updateCredentialsButton() {
      if (!viewCredsBtn) return;
      const creds = readStoredCredentials();
      viewCredsBtn.disabled = !creds;
    }

    function buildCredentialsText(creds) {
      const lines = [
        "MedConnect Doctor Credentials",
        `Name: ${creds.name || "Doctor"}`,
        `Email: ${creds.email}`,
        `Temporary password: ${creds.password}`,
        "",
        "Please log in and change your password after your first login.",
      ];
      return lines.join("\n");
    }

    function preventEscapeClose(e) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
    }

    function lockModal() {
      const modalRoot = el.modal?.root;
      if (!modalRoot) return;
      modalRoot.classList.add("is-locked");
      const overlay = modalRoot.querySelector(".mc-modal__overlay");
      const closeBtn = modalRoot.querySelector(".mc-modal__close");
      if (overlay) overlay.removeAttribute("data-close");
      if (closeBtn) closeBtn.removeAttribute("data-close");
      document.addEventListener("keydown", preventEscapeClose, true);
    }

    function unlockModal() {
      const modalRoot = el.modal?.root;
      if (!modalRoot) return;
      modalRoot.classList.remove("is-locked");
      const overlay = modalRoot.querySelector(".mc-modal__overlay");
      const closeBtn = modalRoot.querySelector(".mc-modal__close");
      if (overlay) overlay.setAttribute("data-close", "true");
      if (closeBtn) closeBtn.setAttribute("data-close", "true");
      document.removeEventListener("keydown", preventEscapeClose, true);
    }

    async function copyText(value) {
      if (!value) return false;
      if (navigator?.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(value);
          return true;
        } catch (e) {}
      }
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(textarea);
      return ok;
    }

    function openCredentialsModal(creds) {
      if (!creds || !creds.email || !creds.password) return;
      const body = `
        <div class="dash-credentials">
          <div class="dash-cred__row">
            <span class="dash-cred__label">Doctor email</span>
            <span class="dash-cred__value" id="credEmail">${escapeHtml(creds.email)}</span>
          </div>
          <div class="dash-cred__row">
            <span class="dash-cred__label">Temporary password</span>
            <div class="dash-cred__password">
              <span class="dash-cred__value" id="credPassword">••••••••</span>
              <button type="button" class="btn ghost" data-action="toggle-password">Show</button>
            </div>
          </div>
          <div class="dash-cred__actions">
            <button type="button" class="btn ghost" data-action="copy-password">Copy password</button>
            <button type="button" class="btn ghost" data-action="copy-credentials">Copy full credentials</button>
            <button type="button" class="btn ghost" data-action="download-credentials">Download credentials (.txt)</button>
          </div>
          <label class="dash-cred__confirm">
            <input type="checkbox" id="credSaved" class="dash-check">
            <span>I have saved these credentials</span>
          </label>
          <p class="dash-cred__hint">This modal will stay open until you confirm the credentials are saved.</p>
        </div>
      `;

      const footer = `
        <button type="button" class="btn primary" data-action="close-credentials" disabled>Close</button>
      `;

      el.openModal({ title: "Doctor Credentials", body, footer });
      lockModal();

      const modalRoot = el.modal?.root;
      if (!modalRoot) return;

      const passwordEl = modalRoot.querySelector("#credPassword");
      const toggleBtn = modalRoot.querySelector('[data-action="toggle-password"]');
      const copyPasswordBtn = modalRoot.querySelector('[data-action="copy-password"]');
      const copyCredentialsBtn = modalRoot.querySelector('[data-action="copy-credentials"]');
      const downloadBtn = modalRoot.querySelector('[data-action="download-credentials"]');
      const confirmBox = modalRoot.querySelector("#credSaved");
      const closeBtn = modalRoot.querySelector('[data-action="close-credentials"]');

      let revealed = false;
      if (toggleBtn && passwordEl) {
        toggleBtn.addEventListener("click", () => {
          revealed = !revealed;
          passwordEl.textContent = revealed ? creds.password : "••••••••";
          toggleBtn.textContent = revealed ? "Hide" : "Show";
        });
      }

      if (copyPasswordBtn) {
        copyPasswordBtn.addEventListener("click", () => copyText(creds.password));
      }

      if (copyCredentialsBtn) {
        copyCredentialsBtn.addEventListener("click", () => copyText(buildCredentialsText(creds)));
      }

      if (downloadBtn) {
        downloadBtn.addEventListener("click", () => {
          const blob = new Blob([buildCredentialsText(creds)], { type: "text/plain" });
          const url = URL.createObjectURL(blob);
          const slug = String(creds.email || "doctor")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");
          const link = document.createElement("a");
          link.href = url;
          link.download = `medconnect-credentials-${slug || "doctor"}.txt`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(url);
        });
      }

      if (confirmBox && closeBtn) {
        closeBtn.disabled = !confirmBox.checked;
        confirmBox.addEventListener("change", () => {
          closeBtn.disabled = !confirmBox.checked;
        });
      }

      if (closeBtn) {
        closeBtn.addEventListener("click", () => {
          if (confirmBox && !confirmBox.checked) return;
          unlockModal();
          el.closeModal();
        });
      }
    }

    function formatAvailability(doc) {
      const days = Array.isArray(doc.availability_days) ? doc.availability_days : [];
      const dayLabels = days.map((d) => DAY_LABELS[d] || d).join(", ") || "--";
      const start = doc.availability_start || "";
      const end = doc.availability_end || "";
      const window = start && end ? `${start}-${end}` : "--";
      return `${dayLabels} ${window}`.trim();
    }

    function renderDoctors(items) {
      if (!Array.isArray(items) || items.length === 0) {
        setSectionEmpty(doctorsSection, "No doctors found.");
        return;
      }

      setSectionTable(doctorsSection);

      const rows = items.map((d) => {
        const status = d.is_active ? "active" : "inactive";
        const statusBadge = `mc-status mc-status--${escapeHtml(status)}`;
        const toggleLabel = d.is_active ? "Deactivate" : "Activate";

        return `
          <tr data-doctor-id="${escapeHtml(String(d.id))}">
            <td>${escapeHtml(d.full_name || "")}</td>
            <td>${escapeHtml(d.specialty || "")}</td>
            <td>${escapeHtml(d.email || "")}</td>
            <td><span class="${statusBadge}">${escapeHtml(status)}</span></td>
            <td>${escapeHtml(formatAvailability(d))}</td>
            <td>
              <div class="dash-inline">
                <button type="button" class="btn ghost" data-action="edit" data-id="${escapeHtml(String(d.id))}" style="padding:8px 12px; border-width:1px;">Edit</button>
                <button type="button" class="btn ghost" data-action="toggle" data-id="${escapeHtml(String(d.id))}" style="padding:8px 12px; border-width:1px;">${escapeHtml(toggleLabel)}</button>
              </div>
            </td>
          </tr>
        `;
      });

      doctorsSection.tbody.innerHTML = rows.join("");
    }

    function updateDoctorFilter() {
      if (!apptDoctorFilter) return;
      const current = apptDoctorFilter.value;
      apptDoctorFilter.innerHTML = `<option value="">All</option>`;
      state.doctors.forEach((d) => {
        const opt = document.createElement("option");
        opt.value = String(d.id);
        opt.textContent = d.full_name || d.email || `Doctor ${d.id}`;
        apptDoctorFilter.appendChild(opt);
      });
      apptDoctorFilter.value = current;
    }

    async function loadDoctors() {
      setSectionLoading(doctorsSection);

      const res = await apiFetch("/api/admin/doctors", { method: "GET" });
      if (!res.ok) {
        setSectionError(doctorsSection, "Unable to load doctors.");
        return;
      }

      const payload = await res.json().catch(() => null);
      const items = payload?.data || [];

      state.doctors = Array.isArray(items) ? items : [];
      renderDoctors(state.doctors);
      updateDoctorFilter();
    }

    function renderAppointments(items) {
      if (!Array.isArray(items) || items.length === 0) {
        setSectionEmpty(apptSection, "No appointments found.");
        return;
      }

      setSectionTable(apptSection);
      state.apptMap.clear();

      const rows = items.map((a) => {
        const id = a.id ?? null;
        const date = a.date || "";
        const time = a.time || "";
        const patient = a.patient_name || a.name || "";
        const doctor = a.doctor || a.doctor_name || "";
        const status = a.status || "booked";
        const statusNorm = String(status || "").trim().toLowerCase();

        const appt = {
          id,
          status,
          specialty: a.specialty || "",
          doctor,
          date,
          time,
          name: patient,
          phone: a.patient_phone || a.phone || "",
          email: a.patient_email || a.email || "",
        };

        if (id != null) state.apptMap.set(String(id), appt);

        const statusBadge = `mc-status mc-status--${escapeHtml(statusNorm || "unknown")}`;

        return `
          <tr>
            <td>${escapeHtml(date)}</td>
            <td>${escapeHtml(time)}</td>
            <td>${escapeHtml(patient)}</td>
            <td>${escapeHtml(doctor)}</td>
            <td><span class="${statusBadge}">${escapeHtml(status)}</span></td>
            <td>
              <button type="button" class="btn ghost" data-action="view" data-id="${escapeHtml(String(id ?? ""))}" style="padding:8px 12px; border-width:1px;">View</button>
            </td>
          </tr>
        `;
      });

      apptSection.tbody.innerHTML = rows.join("");
    }

    function applyFilters() {
      let items = Array.isArray(state.appointments) ? [...state.appointments] : [];

      const status = apptStatusFilter?.value || "";
      const doctorId = apptDoctorFilter?.value || "";
      const from = apptFrom?.value || "";
      const to = apptTo?.value || "";

      if (status) {
        items = items.filter((a) => String(a.status || "").toLowerCase() === status);
      }

      if (doctorId) {
        items = items.filter((a) => String(a.doctor_id ?? "") === doctorId);
      }

      if (from) {
        items = items.filter((a) => String(a.date || "") >= from);
      }

      if (to) {
        items = items.filter((a) => String(a.date || "") <= to);
      }

      renderAppointments(items);
    }

    async function loadAppointments() {
      setSectionLoading(apptSection);

      const res = await apiFetch("/api/appointments", { method: "GET" });
      if (!res.ok) {
        setSectionError(apptSection, "Unable to load appointments.");
        return;
      }

      const payload = await res.json().catch(() => null);
      const items = payload?.data?.items || payload?.items || payload?.data || [];

      state.appointments = Array.isArray(items) ? items : [];
      applyFilters();
    }

    function downloadAppointmentsCsv() {
      const params = new URLSearchParams();
      const status = apptStatusFilter?.value || "";
      const doctorId = apptDoctorFilter?.value || "";
      const from = apptFrom?.value || "";
      const to = apptTo?.value || "";

      if (status) params.set("status", status);
      if (doctorId) params.set("doctor_id", doctorId);
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const qs = params.toString();
      const url = `${apiBase}/api/admin/appointments/export${qs ? `?${qs}` : ""}`;
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    }

    function openDoctorModal(doctor) {
      const isEdit = !!doctor;
      const selectedDays = new Set(doctor?.availability_days || []);

      const dayChecks = DAYS.map((day) => {
        const checked = selectedDays.has(day) ? "checked" : "";
        return `
          <label class="dash-fieldset__row">
            <span class="dash-fieldset__label">${escapeHtml(DAY_LABELS[day])}</span>
            <input class="dash-check" type="checkbox" name="availability_days" value="${escapeHtml(day)}" ${checked}>
          </label>
        `;
      }).join("");

      const body = `
        <form class="dash-form" id="doctorForm">
          <div class="dash-form__row">
            <label for="doctorFullName">Full name</label>
            <input type="text" id="doctorFullName" value="${escapeHtml(doctor?.full_name || "")}" />
          </div>
          <div class="dash-form__row">
            <label for="doctorEmail">Email</label>
            <input type="email" id="doctorEmail" value="${escapeHtml(doctor?.email || "")}" />
          </div>
          <div class="dash-form__row">
            <label for="doctorSpecialty">Specialty</label>
            <input type="text" id="doctorSpecialty" value="${escapeHtml(doctor?.specialty || "")}" />
          </div>
          <div class="dash-form__row">
            <label for="doctorPhone">Phone</label>
            <input type="text" id="doctorPhone" value="${escapeHtml(doctor?.phone || "")}" />
          </div>
          <div class="dash-form__row">
            <label for="doctorAvailStart">Availability start</label>
            <input type="time" id="doctorAvailStart" step="3600" value="${escapeHtml(doctor?.availability_start || "")}" />
          </div>
          <div class="dash-form__row">
            <label for="doctorAvailEnd">Availability end</label>
            <input type="time" id="doctorAvailEnd" step="3600" value="${escapeHtml(doctor?.availability_end || "")}" />
          </div>
          <fieldset class="dash-fieldset">
            <legend>Availability days</legend>
            <div class="dash-fieldset__rows">
              ${dayChecks}
            </div>
          </fieldset>
          <div class="dash-form__row">
            <label class="dash-fieldset__row dash-fieldset__row--solo">
              <span class="dash-fieldset__label">Active</span>
              <input class="dash-check" type="checkbox" id="doctorActive" ${doctor?.is_active !== false ? "checked" : ""}>
            </label>
          </div>
          <div class="dash-error hidden" id="doctorFormError"></div>
        </form>
      `;

      const footer = `
        <button type="button" class="btn ghost" data-close="true">Cancel</button>
        <button type="button" class="btn primary" data-action="save-doctor">${isEdit ? "Save" : "Add"}</button>
      `;

      el.openModal({ title: isEdit ? "Edit doctor" : "Add doctor", body, footer });

      const modalRoot = el.modal.root;
      if (!modalRoot) return;
      modalRoot.classList.add("mc-modal--doctor");
      let escHandler = null;
      const cleanupDoctorModal = () => {
        modalRoot.classList.remove("mc-modal--doctor");
        if (escHandler) {
          document.removeEventListener("keydown", escHandler, true);
        }
      };
      escHandler = (e) => {
        if (e.key === "Escape") cleanupDoctorModal();
      };
      document.addEventListener("keydown", escHandler, true);
      modalRoot.querySelectorAll('[data-close="true"]').forEach((btn) => {
        btn.addEventListener("click", cleanupDoctorModal, { once: true });
      });
      const saveBtn = modalRoot.querySelector('[data-action="save-doctor"]');
      const errorBox = modalRoot.querySelector("#doctorFormError");

      function showError(message) {
        if (!errorBox) return;
        errorBox.textContent = message;
        errorBox.classList.remove("hidden");
      }

      function clearError() {
        if (errorBox) errorBox.classList.add("hidden");
      }

      if (!saveBtn) return;

      saveBtn.addEventListener("click", async () => {
        clearError();

        const fullName = modalRoot.querySelector("#doctorFullName")?.value.trim();
        const email = modalRoot.querySelector("#doctorEmail")?.value.trim();
        const specialty = modalRoot.querySelector("#doctorSpecialty")?.value.trim();
        const phone = modalRoot.querySelector("#doctorPhone")?.value.trim();
        const start = modalRoot.querySelector("#doctorAvailStart")?.value.trim();
        const end = modalRoot.querySelector("#doctorAvailEnd")?.value.trim();
        const isActive = modalRoot.querySelector("#doctorActive")?.checked ?? true;

        const days = Array.from(
          modalRoot.querySelectorAll('input[name="availability_days"]:checked')
        ).map((input) => input.value);

        if (!fullName) {
          showError("Full name is required.");
          return;
        }
        if (!email) {
          showError("Email is required.");
          return;
        }
        if (!specialty) {
          showError("Specialty is required.");
          return;
        }
        if (!start || !end) {
          showError("Availability start and end are required.");
          return;
        }
        if (!days.length) {
          showError("Select at least one availability day.");
          return;
        }
        if (start >= end) {
          showError("Availability start must be before end.");
          return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = "Saving...";

        const payload = {
          full_name: fullName,
          email,
          specialty,
          phone: phone || null,
          is_active: isActive,
          availability_days: days,
          availability_start: start,
          availability_end: end,
        };

        const url = isEdit
          ? `/api/admin/doctors/${encodeURIComponent(doctor.id)}`
          : "/api/admin/doctors";
        const method = isEdit ? "PATCH" : "POST";

        const res = await apiFetch(url, {
          method,
          body: JSON.stringify(payload),
        });

        saveBtn.disabled = false;
        saveBtn.textContent = isEdit ? "Save" : "Add";

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          const msg = data?.error?.message || "Unable to save doctor.";
          showError(msg);
          return;
        }

        const data = await res.json().catch(() => null);
        if (!data || data.success !== true) {
          showError("Unable to save doctor.");
          return;
        }

        cleanupDoctorModal();
        el.closeModal();
        loadDoctors();

        const tempPassword = data?.data?.temp_password;
        if (tempPassword && !isEdit) {
          const doctorData = data?.data?.doctor || {};
          const credentials = {
            name: doctorData.full_name || fullName,
            email: doctorData.email || email,
            password: tempPassword,
            created_at: new Date().toISOString(),
          };
          storeCredentials(credentials);
          openCredentialsModal(credentials);
        }
      });
    }

    function openAppointmentModal(appt) {
      const rows = [
        ["Status", appt.status || ""],
        ["Specialty", appt.specialty || ""],
        ["Doctor", appt.doctor || ""],
        ["Date", appt.date || ""],
        ["Time", appt.time || ""],
        ["Patient", appt.name || ""],
        ["Phone", appt.phone || ""],
        ["Email", appt.email || ""],
        ["Appointment ID", appt.id ?? ""],
      ].filter(([, v]) => String(v || "").trim());

      el.openModal({ title: "Appointment details", body: buildKvRows(rows) });
    }

    el.moduleRoot.addEventListener("click", (e) => {
      const t = e.target;
      if (!t) return;

      const editBtn = t.closest && t.closest("[data-action='edit']");
      if (editBtn) {
        const id = editBtn.getAttribute("data-id");
        const doc = state.doctors.find((d) => String(d.id) === String(id));
        if (doc) openDoctorModal(doc);
        return;
      }

      const toggleBtn = t.closest && t.closest("[data-action='toggle']");
      if (toggleBtn) {
        const id = toggleBtn.getAttribute("data-id");
        const doc = state.doctors.find((d) => String(d.id) === String(id));
        if (!doc) return;

        const nextActive = !doc.is_active;
        const confirmMsg = nextActive ? "Activate this doctor?" : "Deactivate this doctor?";
        if (!window.confirm(confirmMsg)) return;

        apiFetch(`/api/admin/doctors/${encodeURIComponent(doc.id)}/status`, {
          method: "PATCH",
          body: JSON.stringify({ is_active: nextActive }),
        })
          .then((res) => res.json().catch(() => null).then((data) => ({ res, data })))
          .then(({ res, data }) => {
            if (!res.ok || !data || data.success !== true) {
              alert("Unable to update doctor status.");
              return;
            }
            loadDoctors();
          })
          .catch(() => {
            alert("Unable to update doctor status.");
          });
        return;
      }

      const viewBtn = t.closest && t.closest("[data-action='view']");
      if (viewBtn) {
        const id = viewBtn.getAttribute("data-id");
        const appt = state.apptMap.get(String(id || ""));
        if (appt) openAppointmentModal(appt);
      }
    });

    if (addDoctorBtn) {
      addDoctorBtn.addEventListener("click", () => openDoctorModal(null));
    }

    if (viewCredsBtn) {
      viewCredsBtn.addEventListener("click", () => {
        const creds = readStoredCredentials();
        if (creds) openCredentialsModal(creds);
      });
    }

    if (apptStatusFilter) apptStatusFilter.addEventListener("change", applyFilters);
    if (apptDoctorFilter) apptDoctorFilter.addEventListener("change", applyFilters);
    if (apptFrom) apptFrom.addEventListener("change", applyFilters);
    if (apptTo) apptTo.addEventListener("change", applyFilters);

    if (apptClear) {
      apptClear.addEventListener("click", () => {
        if (apptStatusFilter) apptStatusFilter.value = "";
        if (apptDoctorFilter) apptDoctorFilter.value = "";
        if (apptFrom) apptFrom.value = "";
        if (apptTo) apptTo.value = "";
        applyFilters();
      });
    }

    if (apptExport) {
      apptExport.addEventListener("click", (e) => {
        e.preventDefault();
        downloadAppointmentsCsv();
      });
    }

    if (quoteSection && window.DashboardsAdminQuoteRequests?.initSection) {
      window.DashboardsAdminQuoteRequests.initSection({
        apiBase,
        el,
        sectionRoot: quoteSection,
      });
    }

    updateCredentialsButton();
    loadDoctors();
    loadAppointments();
  }

  window.DashboardsAdmin = { initDashboard };
})();
