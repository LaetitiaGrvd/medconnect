(() => {
  const STATUS_OPTIONS = ["booked", "confirmed", "cancelled", "completed"];
  const ui = window.MC_UI;

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

  function listToText(items) {
    if (!Array.isArray(items)) return "";
    return items.map((v) => String(v || "").trim()).filter(Boolean).join("\n");
  }

  function textToList(value) {
    return String(value || "")
      .split("\n")
      .map((v) => v.trim())
      .filter(Boolean);
  }

  function notify(message, type = "error") {
    if (!message) return;
    if (ui?.toast) {
      ui.toast(message, type);
    }
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
    const apiFetchForm = (path, formData) =>
      fetch(`${apiBase}${path}`, {
        method: "POST",
        body: formData,
        cache: "no-store",
        credentials: "include",
      });

    const DEFAULT_AVATAR = "assets/img/default_avatar.jpg";
    const API_BASE = String(apiBase || "").replace(/\/+$/, "");
    const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
    const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

    function resolveAvatarUrl(url) {
      if (!url) return DEFAULT_AVATAR;
      if (/^https?:\/\//i.test(url)) return url;
      if (!API_BASE) return url.startsWith("/") ? url : `/${url}`;
      return url.startsWith("/") ? `${API_BASE}${url}` : `${API_BASE}/${url}`;
    }

    el.moduleRoot.innerHTML = `
      <section class="dash-section" id="doctor-profile">
        <div class="dash-section__head">
          <h2>Profile</h2>
        </div>
        <div class="doctor-profile-card">
          <div class="doctor-avatar">
            <img id="doctorAvatarImg" class="doctor-avatar__img" alt="Doctor avatar">
          </div>
          <div class="doctor-profile__body">
            <h3 id="doctorProfileName" class="doctor-profile__name"></h3>
            <p id="doctorProfileSpecialty" class="doctor-profile__specialty"></p>
            <div class="doctor-profile__actions">
              <button type="button" class="btn ghost" id="doctorAvatarChange">Change photo</button>
              <button type="button" class="btn ghost hidden" id="doctorAvatarRemove">Remove photo</button>
            </div>
            <input type="file" id="doctorAvatarInput" accept="image/png,image/jpeg,image/webp" class="hidden">
            <div class="doctor-avatar__preview hidden" id="doctorAvatarPreview">
              <p class="doctor-avatar__preview-label">Preview</p>
              <img id="doctorAvatarPreviewImg" class="doctor-avatar__preview-img" alt="Avatar preview" src="${DEFAULT_AVATAR}">
              <div class="doctor-avatar__buttons">
                <button type="button" class="btn primary" id="doctorAvatarSave">Save</button>
                <button type="button" class="btn ghost" id="doctorAvatarCancel">Cancel</button>
              </div>
            </div>
            <div class="dash-error hidden" id="doctorAvatarError"></div>
          </div>
        </div>
      </section>

      <section class="dash-section" id="doctor-details">
        <div class="dash-section__head">
          <h2>Profile details</h2>
          <span class="muted">Shown on your public profile</span>
        </div>
        <div class="dash-loading" data-role="loading">Loading...</div>
        <div class="dash-error hidden" data-role="error"></div>
        <form class="dash-form hidden" data-role="form">
          <div class="dash-form__row">
            <label for="doctorBio">Bio</label>
            <textarea id="doctorBio" rows="5" placeholder="Short professional summary"></textarea>
          </div>
          <div class="dash-form__row">
            <label for="doctorExperienceInput">Experience</label>
            <textarea id="doctorExperienceInput" rows="4" placeholder="One item per line"></textarea>
            <span class="muted">One item per line</span>
          </div>
          <div class="dash-form__row">
            <label for="doctorCertificationsInput">Certifications</label>
            <textarea id="doctorCertificationsInput" rows="4" placeholder="One item per line"></textarea>
            <span class="muted">One item per line</span>
          </div>
          <div class="dash-form__row">
            <label for="doctorSpecialisationsInput">Specialisations</label>
            <textarea id="doctorSpecialisationsInput" rows="4" placeholder="One item per line"></textarea>
            <span class="muted">One item per line</span>
          </div>
          <div class="dash-inline">
            <button type="submit" class="btn primary" id="doctorDetailsSave">Save changes</button>
            <button type="button" class="btn ghost" id="doctorDetailsReset">Reset</button>
            <span class="muted hidden" id="doctorDetailsSaved">Saved</span>
          </div>
        </form>
      </section>

      <section class="dash-section" id="doctor-summary">
        <div class="dash-section__head">
          <h2>Summary</h2>
        </div>
        <div class="dash-loading" data-role="loading">Loading...</div>
        <div class="dash-error hidden" data-role="error"></div>
        <div class="dash-cards hidden" data-role="cards">
          <div class="dash-card">
            <p class="dash-card__label">Today</p>
            <p class="dash-card__value" data-role="today">0</p>
          </div>
          <div class="dash-card">
            <p class="dash-card__label">Next 7 days</p>
            <p class="dash-card__value" data-role="week">0</p>
          </div>
          <div class="dash-card">
            <p class="dash-card__label">Status counts</p>
            <ul class="dash-card__list" data-role="status-list"></ul>
          </div>
        </div>
      </section>

      <section class="dash-section" id="doctor-appointments">
        <div class="dash-section__head">
          <h2>Appointments</h2>
          <div class="dash-actions">
            <label>
              Range
              <select id="doctorApptRange">
                <option value="today">Today</option>
                <option value="week">Next 7 days</option>
                <option value="all">All</option>
              </select>
            </label>
          </div>
        </div>
        <div class="dash-loading" data-role="loading">Loading...</div>
        <div class="dash-error hidden" data-role="error"></div>
        <div class="dash-empty hidden" data-role="empty">No appointments to display.</div>
        <div class="table-wrap hidden" data-role="table">
          <table class="mc-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Patient</th>
                <th>Phone</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody data-role="tbody"></tbody>
          </table>
        </div>
      </section>
    `;

    const summaryRoot = document.getElementById("doctor-summary");
    const summaryCards = summaryRoot?.querySelector('[data-role="cards"]');
    const summaryToday = summaryRoot?.querySelector('[data-role="today"]');
    const summaryWeek = summaryRoot?.querySelector('[data-role="week"]');
    const summaryStatusList = summaryRoot?.querySelector('[data-role="status-list"]');
    const summaryLoading = summaryRoot?.querySelector('[data-role="loading"]');
    const summaryError = summaryRoot?.querySelector('[data-role="error"]');

    const apptSection = sectionEls(document.getElementById("doctor-appointments"));
    const apptRange = document.getElementById("doctorApptRange");

    const profileAvatar = document.getElementById("doctorAvatarImg");
    const profileName = document.getElementById("doctorProfileName");
    const profileSpecialty = document.getElementById("doctorProfileSpecialty");
    const changeAvatarBtn = document.getElementById("doctorAvatarChange");
    const removeAvatarBtn = document.getElementById("doctorAvatarRemove");
    const avatarInput = document.getElementById("doctorAvatarInput");
    const avatarPreview = document.getElementById("doctorAvatarPreview");
    const avatarPreviewImg = document.getElementById("doctorAvatarPreviewImg");
    const avatarSaveBtn = document.getElementById("doctorAvatarSave");
    const avatarCancelBtn = document.getElementById("doctorAvatarCancel");
    const avatarError = document.getElementById("doctorAvatarError");

    const detailsRoot = document.getElementById("doctor-details");
    const detailsLoading = detailsRoot?.querySelector('[data-role="loading"]');
    const detailsError = detailsRoot?.querySelector('[data-role="error"]');
    const detailsForm = detailsRoot?.querySelector('[data-role="form"]');
    const detailsSaved = document.getElementById("doctorDetailsSaved");
    const detailsSave = document.getElementById("doctorDetailsSave");
    const detailsReset = document.getElementById("doctorDetailsReset");
    const detailsBio = document.getElementById("doctorBio");
    const detailsExperience = document.getElementById("doctorExperienceInput");
    const detailsCerts = document.getElementById("doctorCertificationsInput");
    const detailsSpecs = document.getElementById("doctorSpecialisationsInput");

    let currentAvatarUrl = user?.avatar_url || "";
    let pendingFile = null;
    let previewUrl = null;
    let detailsSnapshot = null;

    function showAvatarError(message) {
      if (!avatarError) return;
      avatarError.textContent = message;
      avatarError.classList.remove("hidden");
    }

    function clearAvatarError() {
      if (avatarError) avatarError.classList.add("hidden");
    }

    function setAvatarImage(url) {
      if (!profileAvatar) return;
      profileAvatar.src = resolveAvatarUrl(url);
      profileAvatar.onerror = () => {
        profileAvatar.onerror = null;
        profileAvatar.src = DEFAULT_AVATAR;
      };
    }

    function updateRemoveButton() {
      if (!removeAvatarBtn) return;
      removeAvatarBtn.classList.toggle("hidden", !currentAvatarUrl);
    }

    function setDetailsLoading() {
      if (!detailsRoot) return;
      show(detailsLoading);
      hide(detailsError);
      hide(detailsForm);
      if (detailsSaved) detailsSaved.classList.add("hidden");
    }

    function setDetailsError(message) {
      if (!detailsRoot) return;
      hide(detailsLoading);
      hide(detailsForm);
      if (detailsError) {
        detailsError.textContent = message;
        show(detailsError);
      }
      if (detailsSaved) detailsSaved.classList.add("hidden");
    }

    function showDetailsError(message) {
      if (detailsError) {
        detailsError.textContent = message;
        show(detailsError);
      }
    }

    function clearDetailsError() {
      if (detailsError) detailsError.classList.add("hidden");
    }

    function setDetailsReady() {
      if (!detailsRoot) return;
      hide(detailsLoading);
      hide(detailsError);
      show(detailsForm);
    }

    function fillDetailsForm(data) {
      if (!data) return;
      if (detailsBio) detailsBio.value = data.bio || "";
      if (detailsExperience) detailsExperience.value = listToText(data.experience);
      if (detailsCerts) detailsCerts.value = listToText(data.certifications);
      if (detailsSpecs) detailsSpecs.value = listToText(data.specialisations);
      detailsSnapshot = {
        bio: data.bio || "",
        experience: listToText(data.experience),
        certifications: listToText(data.certifications),
        specialisations: listToText(data.specialisations),
      };
      if (detailsSaved) detailsSaved.classList.add("hidden");
    }

    function resetDetailsForm() {
      if (!detailsSnapshot) return;
      if (detailsBio) detailsBio.value = detailsSnapshot.bio || "";
      if (detailsExperience) detailsExperience.value = detailsSnapshot.experience || "";
      if (detailsCerts) detailsCerts.value = detailsSnapshot.certifications || "";
      if (detailsSpecs) detailsSpecs.value = detailsSnapshot.specialisations || "";
      if (detailsSaved) detailsSaved.classList.add("hidden");
      clearDetailsError();
    }

    function resetPreview() {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        previewUrl = null;
      }
      pendingFile = null;
      if (avatarInput) avatarInput.value = "";
      if (avatarPreview) avatarPreview.classList.add("hidden");
      if (avatarPreviewImg) avatarPreviewImg.src = DEFAULT_AVATAR;
    }

    if (profileName) profileName.textContent = user?.name || "Doctor";
    if (profileSpecialty) {
      const spec = user?.specialty || "";
      profileSpecialty.textContent = spec;
      profileSpecialty.classList.toggle("hidden", !spec);
    }
    setAvatarImage(currentAvatarUrl);
    updateRemoveButton();

    if (detailsReset) {
      detailsReset.addEventListener("click", () => {
        resetDetailsForm();
      });
    }

    if (detailsForm) {
      detailsForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        clearDetailsError();

        if (detailsSave) detailsSave.disabled = true;
        if (detailsReset) detailsReset.disabled = true;
        const originalText = detailsSave ? detailsSave.textContent : "";
        if (detailsSave) detailsSave.textContent = "Saving...";

        const payload = {
          bio: detailsBio ? detailsBio.value.trim() : "",
          experience: textToList(detailsExperience ? detailsExperience.value : ""),
          certifications: textToList(detailsCerts ? detailsCerts.value : ""),
          specialisations: textToList(detailsSpecs ? detailsSpecs.value : ""),
        };

        try {
          const res = await apiFetch("/api/doctor/profile", {
            method: "PATCH",
            body: JSON.stringify(payload),
          });
          const data = await res.json().catch(() => null);
          if (!res.ok || !data || data.success !== true) {
            const msg = data?.error?.message || "Unable to update profile.";
            showDetailsError(msg);
            notify(msg, "error");
          } else {
            fillDetailsForm(data.data || payload);
            setDetailsReady();
            if (detailsSaved) detailsSaved.classList.remove("hidden");
            notify("Profile updated.", "success");
          }
        } catch (err) {
          showDetailsError("Unable to update profile.");
          notify("Unable to update profile.", "error");
        } finally {
          if (detailsSave) detailsSave.disabled = false;
          if (detailsReset) detailsReset.disabled = false;
          if (detailsSave) detailsSave.textContent = originalText || "Save changes";
        }
      });
    }

    if (changeAvatarBtn && avatarInput) {
      changeAvatarBtn.addEventListener("click", () => avatarInput.click());
    }

    if (avatarInput) {
      avatarInput.addEventListener("change", () => {
        clearAvatarError();
        const file = avatarInput.files && avatarInput.files[0];
        if (!file) {
          resetPreview();
          return;
        }
        if (!ALLOWED_TYPES.includes(file.type)) {
          showAvatarError("Invalid file type. Use JPG, PNG, or WEBP.");
          resetPreview();
          return;
        }
        if (file.size > MAX_AVATAR_SIZE) {
          showAvatarError("File too large. Max size is 2 MB.");
          resetPreview();
          return;
        }
        pendingFile = file;
        previewUrl = URL.createObjectURL(file);
        if (avatarPreviewImg) avatarPreviewImg.src = previewUrl;
        if (avatarPreview) avatarPreview.classList.remove("hidden");
      });
    }

    if (avatarCancelBtn) {
      avatarCancelBtn.addEventListener("click", () => {
        clearAvatarError();
        resetPreview();
      });
    }

    if (avatarSaveBtn) {
      avatarSaveBtn.addEventListener("click", async () => {
        if (!pendingFile) return;
        clearAvatarError();

        avatarSaveBtn.disabled = true;
        if (avatarCancelBtn) avatarCancelBtn.disabled = true;
        if (changeAvatarBtn) changeAvatarBtn.disabled = true;
        if (removeAvatarBtn) removeAvatarBtn.disabled = true;
        const originalText = avatarSaveBtn.textContent;
        avatarSaveBtn.textContent = "Saving...";

        const formData = new FormData();
        formData.append("avatar", pendingFile);

        try {
          const res = await apiFetchForm("/api/doctor/avatar", formData);
          const payload = await res.json().catch(() => null);
          if (!res.ok || !payload || payload.success !== true) {
            const msg = payload?.error?.message || "Unable to upload avatar.";
            showAvatarError(msg);
          } else {
            currentAvatarUrl = payload?.data?.avatar_url || "";
            setAvatarImage(currentAvatarUrl);
            updateRemoveButton();
            resetPreview();
          }
        } catch (err) {
          showAvatarError("Unable to upload avatar.");
        } finally {
          avatarSaveBtn.disabled = false;
          if (avatarCancelBtn) avatarCancelBtn.disabled = false;
          if (changeAvatarBtn) changeAvatarBtn.disabled = false;
          if (removeAvatarBtn) removeAvatarBtn.disabled = false;
          avatarSaveBtn.textContent = originalText;
        }
      });
    }

    if (removeAvatarBtn) {
      removeAvatarBtn.addEventListener("click", async () => {
        clearAvatarError();
        removeAvatarBtn.disabled = true;
        const originalText = removeAvatarBtn.textContent;
        removeAvatarBtn.textContent = "Removing...";
        try {
          const res = await fetch(`${apiBase}/api/doctor/avatar`, {
            method: "DELETE",
            cache: "no-store",
            credentials: "include",
          });
          const payload = await res.json().catch(() => null);
          if (!res.ok || !payload || payload.success !== true) {
            const msg = payload?.error?.message || "Unable to remove avatar.";
            showAvatarError(msg);
          } else {
            currentAvatarUrl = "";
            setAvatarImage(currentAvatarUrl);
            updateRemoveButton();
          }
        } catch (err) {
          showAvatarError("Unable to remove avatar.");
        } finally {
          removeAvatarBtn.disabled = false;
          removeAvatarBtn.textContent = originalText;
        }
      });
    }

    const state = {
      range: "today",
      apptMap: new Map(),
    };

    function setSummaryLoading() {
      show(summaryLoading);
      hide(summaryError);
      if (summaryCards) summaryCards.classList.add("hidden");
    }

    function setSummaryError(message) {
      hide(summaryLoading);
      if (summaryError) {
        summaryError.textContent = message;
        show(summaryError);
      }
      if (summaryCards) summaryCards.classList.add("hidden");
    }

    function setSummaryData(data) {
      hide(summaryLoading);
      hide(summaryError);
      if (summaryCards) summaryCards.classList.remove("hidden");
      if (summaryToday) summaryToday.textContent = String(data.today ?? 0);
      if (summaryWeek) summaryWeek.textContent = String(data.week ?? 0);

      if (summaryStatusList) {
        const entries = Object.entries(data.by_status || {});
        if (!entries.length) {
          summaryStatusList.innerHTML = "<li>No status data</li>";
          return;
        }
        summaryStatusList.innerHTML = entries
          .map(([k, v]) => `<li>${escapeHtml(k)}: ${escapeHtml(String(v))}</li>`)
          .join("");
      }
    }

    async function loadSummary() {
      setSummaryLoading();

      const res = await apiFetch("/api/doctor/summary", { method: "GET" });
      if (!res.ok) {
        setSummaryError("Unable to load summary.");
        return;
      }

      const payload = await res.json().catch(() => null);
      if (!payload || payload.success !== true || !payload.data) {
        setSummaryError("Unable to load summary.");
        return;
      }

      setSummaryData(payload.data);
    }

    async function loadProfileDetails() {
      if (!detailsRoot) return;
      setDetailsLoading();

      const res = await apiFetch("/api/doctor/profile", { method: "GET" });
      if (!res.ok) {
        setDetailsError("Unable to load profile details.");
        return;
      }

      const payload = await res.json().catch(() => null);
      if (!payload || payload.success !== true || !payload.data) {
        setDetailsError("Unable to load profile details.");
        return;
      }

      fillDetailsForm(payload.data);
      setDetailsReady();
    }

    function renderAppointments(items) {
      if (!Array.isArray(items) || items.length === 0) {
        setSectionEmpty(apptSection, "No appointments to display.");
        return;
      }

      setSectionTable(apptSection);
      state.apptMap.clear();

      const rows = items.map((a) => {
        const id = a.id ?? null;
        const date = a.date || "";
        const time = a.time || "";
        const patient = a.patient_name || a.name || "";
        const phone = a.patient_phone || a.phone || "";
        const status = a.status || "booked";
        const statusNorm = String(status || "").trim().toLowerCase();

        const appt = {
          id,
          status,
          specialty: a.specialty || "",
          doctor: a.doctor || a.doctor_name || "",
          date,
          time,
          name: patient,
          phone,
          email: a.patient_email || a.email || "",
        };

        if (id != null) state.apptMap.set(String(id), appt);

        const statusOptions = STATUS_OPTIONS.map((opt) => {
          const selected = opt === statusNorm ? "selected" : "";
          return `<option value="${escapeHtml(opt)}" ${selected}>${escapeHtml(opt)}</option>`;
        }).join("");

        const statusBadge = `mc-status mc-status--${escapeHtml(statusNorm || "unknown")}`;

        return `
          <tr data-appt-id="${escapeHtml(String(id ?? ""))}">
            <td>${escapeHtml(date)}</td>
            <td>${escapeHtml(time)}</td>
            <td>${escapeHtml(patient)}</td>
            <td>${escapeHtml(phone)}</td>
            <td><span class="${statusBadge}">${escapeHtml(status)}</span></td>
            <td>
              <div class="dash-inline">
                <button type="button" class="btn ghost" data-action="view" data-id="${escapeHtml(String(id ?? ""))}" style="padding:8px 12px; border-width:1px;">View</button>
                <select data-role="status" data-id="${escapeHtml(String(id ?? ""))}">
                  ${statusOptions}
                </select>
                <button type="button" class="btn ghost" data-action="save-status" data-id="${escapeHtml(String(id ?? ""))}" style="padding:8px 12px; border-width:1px;">Save</button>
                <button type="button" class="btn primary" data-action="notify" data-id="${escapeHtml(String(id ?? ""))}" style="padding:8px 12px;">Notify</button>
              </div>
            </td>
          </tr>
        `;
      });

      apptSection.tbody.innerHTML = rows.join("");
    }

    async function loadAppointments() {
      if (!apptSection) return;
      setSectionLoading(apptSection);

      const range = apptRange?.value || "today";
      state.range = range;

      const res = await apiFetch(`/api/doctor/appointments?range=${encodeURIComponent(range)}`, {
        method: "GET",
      });

      if (!res.ok) {
        setSectionError(apptSection, "Unable to load appointments.");
        return;
      }

      const payload = await res.json().catch(() => null);
      const items = payload?.data?.items || payload?.items || [];

      renderAppointments(items);
    }

    function openViewModal(appt) {
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

    function openNotifyModal(appt) {
      const body = `
        <div class="dash-form">
          <div class="dash-form__row">
          <label for="notifyTemplate">Template</label>
          <select id="notifyTemplate">
            <option value="reminder">Reminder</option>
            <option value="change">Change request</option>
            <option value="custom">Custom</option>
          </select>
        </div>
          <div class="dash-form__row hidden" id="notifyCustomRow">
            <label for="notifyCustom">Custom message</label>
            <textarea id="notifyCustom" rows="4" placeholder="Type your message"></textarea>
          </div>
          <div class="dash-error hidden" id="notifyError"></div>
        </div>
      `;

      const footer = `
        <button type="button" class="btn ghost" data-close="true">Cancel</button>
        <button type="button" class="btn primary" data-action="send-notify">Send</button>
      `;

      el.openModal({ title: "Notify patient", body, footer });

      const modalRoot = el.modal.root;
      const templateSelect = modalRoot.querySelector("#notifyTemplate");
      const customRow = modalRoot.querySelector("#notifyCustomRow");
      const customInput = modalRoot.querySelector("#notifyCustom");
      const errorBox = modalRoot.querySelector("#notifyError");
      const sendBtn = modalRoot.querySelector('[data-action="send-notify"]');

      function showError(message) {
        if (!errorBox) return;
        errorBox.textContent = message;
        errorBox.classList.remove("hidden");
      }

      function clearError() {
        if (errorBox) errorBox.classList.add("hidden");
      }

      if (templateSelect) {
        templateSelect.addEventListener("change", () => {
          const val = templateSelect.value;
          if (customRow) customRow.classList.toggle("hidden", val !== "custom");
        });
      }

      if (sendBtn) {
        sendBtn.addEventListener("click", async () => {
          clearError();
          const templateKey = templateSelect ? templateSelect.value : "reminder";
          const customMessage = customInput ? customInput.value.trim() : "";

          if (templateKey === "custom" && !customMessage) {
            showError("Custom message is required.");
            return;
          }

          sendBtn.disabled = true;
          sendBtn.textContent = "Sending...";

          const res = await apiFetch(`/api/doctor/appointments/${encodeURIComponent(appt.id)}/notify`, {
            method: "POST",
            body: JSON.stringify({
              template_key: templateKey,
              custom_message: templateKey === "custom" ? customMessage : undefined,
            }),
          });

          sendBtn.disabled = false;
          sendBtn.textContent = "Send";

          if (!res.ok) {
            const data = await res.json().catch(() => null);
            const msg = data?.error?.message || "Unable to send notification.";
            showError(msg);
            return;
          }

          const data = await res.json().catch(() => null);
          if (!data || data.success !== true) {
            showError("Unable to send notification.");
            return;
          }

          el.closeModal();
          alert("Notification sent.");
        });
      }
    }

    el.moduleRoot.addEventListener("click", (e) => {
      const t = e.target;
      if (!t) return;

      const viewBtn = t.closest && t.closest("[data-action='view']");
      if (viewBtn) {
        const id = viewBtn.getAttribute("data-id");
        const appt = state.apptMap.get(String(id || ""));
        if (appt) openViewModal(appt);
        return;
      }

      const saveBtn = t.closest && t.closest("[data-action='save-status']");
      if (saveBtn) {
        const id = saveBtn.getAttribute("data-id");
        const row = saveBtn.closest("tr");
        const select = row ? row.querySelector("select[data-role='status']") : null;
        const status = select ? select.value : null;
        if (!id || !status) return;

        saveBtn.disabled = true;

        apiFetch(`/api/doctor/appointments/${encodeURIComponent(id)}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        })
          .then((res) => res.json().catch(() => null).then((data) => ({ res, data })))
          .then(({ res, data }) => {
            if (!res.ok || !data || data.success !== true) {
              alert("Unable to update status.");
              return;
            }
            loadSummary();
            loadAppointments();
          })
          .catch(() => {
            alert("Unable to update status.");
          })
          .finally(() => {
            saveBtn.disabled = false;
          });
        return;
      }

      const notifyBtn = t.closest && t.closest("[data-action='notify']");
      if (notifyBtn) {
        const id = notifyBtn.getAttribute("data-id");
        const appt = state.apptMap.get(String(id || ""));
        if (appt) openNotifyModal(appt);
      }
    });

    if (apptRange) {
      apptRange.addEventListener("change", () => {
        loadAppointments();
      });
    }

    loadProfileDetails();
    loadSummary();
    loadAppointments();
  }

  window.DashboardsDoctor = { initDashboard };
})();
