(() => {
  const api = window.MC_API;
  const ui = window.MC_UI;
  const t = window.MC_I18N?.t || ((_, fallback) => fallback);

  const DRAFT_KEY = "mc_appointment_draft_v1";
  const SLOT_MINUTES = 60;
  const DEFAULT_WINDOWS = ["09:00-12:00", "13:00-16:00"];
  const urlParams = new URLSearchParams(window.location.search);
  const preselectDoctorId = urlParams.get("doctor_id") || urlParams.get("doctor");
  const preselectSpecialty = urlParams.get("specialty");

  const el = {
    form: document.getElementById("appointmentForm"),
    steps: Array.from(document.querySelectorAll(".form-step")),
    stepIndicators: Array.from(document.querySelectorAll(".appt-steps .step")),
    prevBtn: document.getElementById("prevBtn"),
    nextBtn: document.getElementById("nextBtn"),
    reviewList: document.getElementById("reviewList"),

    specialty: document.getElementById("specialty"),
    doctor: document.getElementById("doctor"),
    date: document.getElementById("date"),
    time: document.getElementById("time"),
    name: document.getElementById("name"),
    phone: document.getElementById("phone"),
    email: document.getElementById("email"),
  };

  let currentStep = 1;
  let loggedUser = null;
  let skipPatientStep = false;
  let availabilityCache = new Map();

  let specialtyToDoctors = new Map();
  let allDoctors = [];

  async function apiFetch(path, opts = {}) {
    if (!api?.hasBase?.()) {
      const err = new Error("API base URL is not configured.");
      err.code = "API_BASE_MISSING";
      throw err;
    }
    return api.apiFetch(path, opts);
  }

  function val(node) {
    return (node && node.value != null ? String(node.value) : "").trim();
  }

  function setVal(node, value) {
    if (!node) return;
    node.value = value == null ? "" : String(value);
  }

  function normRole(role) {
    return String(role || "").trim().toLowerCase();
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

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function todayISO() {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  }

  function weekdayKey(dateStr) {
    if (!dateStr) return null;
    const d = new Date(`${dateStr}T00:00:00`);
    const keys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    return keys[d.getDay()];
  }

  function availableDaysFromWeekly(weekly) {
    if (!weekly || typeof weekly !== "object") return null;
    const days = [];
    Object.keys(weekly).forEach((key) => {
      const windows = weekly[key];
      if (Array.isArray(windows) && windows.length > 0) days.push(key);
    });
    return days;
  }

  function timeToMinutes(t) {
    const parts = String(t || "").split(":");
    if (parts.length < 2) return NaN;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
    return h * 60 + m;
  }

  function minutesToTime(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${pad2(h)}:${pad2(m)}`;
  }

  function buildSlotsFromWindows(windows) {
    if (!Array.isArray(windows)) return [];
    const slots = [];

    windows.forEach((w) => {
      if (!w || !String(w).includes("-")) return;
      const [startRaw, endRaw] = String(w).split("-", 2);
      const start = timeToMinutes(startRaw.trim());
      const end = timeToMinutes(endRaw.trim());
      if (Number.isNaN(start) || Number.isNaN(end)) return;

      for (let t = start; t + SLOT_MINUTES <= end; t += SLOT_MINUTES) {
        slots.push(minutesToTime(t));
      }
    });

    return slots;
  }

  function enforceMinDate() {
    if (!el.date) return null;
    const min = todayISO();
    el.date.min = min;
    if (val(el.date) && val(el.date) < min) {
      setVal(el.date, min);
    }
    return val(el.date) || null;
  }

  function showStep(step) {
    currentStep = step;

    el.steps.forEach((s) => {
      const n = parseInt(s.getAttribute("data-step"), 10);
      s.classList.toggle("active", n === step);
    });

    el.stepIndicators.forEach((s) => {
      const n = parseInt(s.getAttribute("data-step"), 10);
      s.classList.toggle("active", n === step);
    });

    if (el.prevBtn) el.prevBtn.hidden = step === 1;
    if (el.nextBtn) el.nextBtn.textContent = step === 4 ? t("appt_confirm", "Confirm") : t("appt_next", "Next");
  }

  function nextStepNumber(fromStep) {
    if (skipPatientStep && fromStep === 2) return 4;
    return fromStep + 1;
  }

  function prevStepNumber(fromStep) {
    if (skipPatientStep && fromStep === 4) return 2;
    return fromStep - 1;
  }

  function getDoctorId() {
    if (!el.doctor) return null;
    const opt = el.doctor.selectedOptions && el.doctor.selectedOptions[0];
    const attr = opt ? opt.getAttribute("data-doctor-id") : null;
    const raw = attr || val(el.doctor);
    const parsed = parseInt(raw, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  function findDoctorById(id) {
    const target = Number.parseInt(id, 10);
    if (!Number.isFinite(target)) return null;
    return allDoctors.find((d) => {
      const raw = d.id ?? d.doctor_id;
      return Number.parseInt(raw, 10) === target;
    }) || null;
  }

  function getDoctorLabel() {
    if (!el.doctor) return "";
    const opt = el.doctor.selectedOptions && el.doctor.selectedOptions[0];
    if (opt && opt.textContent) return opt.textContent.trim();
    return val(el.doctor);
  }

  function validateStep(step) {
    if (step === 1) {
      if (!val(el.specialty)) return false;
      if (!val(el.doctor)) return false;
      if (!getDoctorId()) return false;
      return true;
    }

    if (step === 2) {
      if (!val(el.date)) return false;
      if (val(el.date) < todayISO()) return false;
      if (!val(el.time)) return false;
      const opt = el.time?.selectedOptions ? el.time.selectedOptions[0] : null;
      if (opt && opt.disabled) return false;
      return true;
    }

    if (step === 3) {
      if (!val(el.name)) return false;
      if (!val(el.phone)) return false;
      if (!val(el.email)) return false;
      return true;
    }

    return true;
  }

  function buildReview() {
    if (!el.reviewList) return;

    const items = [
      ["Specialty", val(el.specialty)],
      ["Doctor", getDoctorLabel()],
      ["Date", val(el.date)],
      ["Time", val(el.time)],
      ["Name", val(el.name)],
      ["Phone", val(el.phone)],
      ["Email", val(el.email)],
    ];

    el.reviewList.innerHTML = items
      .filter(([, v]) => String(v || "").trim())
      .map(
        ([k, v]) =>
          `<li><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</li>`
      )
      .join("");
  }

  async function getMe() {
    const res = await apiFetch("/api/me", { method: "GET" });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data || data.success !== true || !data.data || !data.data.user) return null;
    return data.data.user;
  }

  function applyPatientAutofill(user) {
    if (!user) return;
    if (!val(el.name)) setVal(el.name, user.name || "");
    if (!val(el.email)) setVal(el.email, user.email || "");
    if (!val(el.phone)) setVal(el.phone, user.phone || "");
  }

  function getPayloadFromUI() {
    return {
      specialty: val(el.specialty),
      doctor: getDoctorLabel(),
      doctor_id: getDoctorId(),
      date: val(el.date),
      time: val(el.time),
      name: val(el.name),
      phone: val(el.phone),
      email: val(el.email),
    };
  }

  function saveDraft(payload) {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    } catch {}
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function clearDraft() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {}
  }

  function applyDraftToUI(draft) {
    if (!draft) return;
    if (draft.specialty) setVal(el.specialty, draft.specialty);
    if (draft.date) setVal(el.date, draft.date);
    if (draft.name) setVal(el.name, draft.name);
    if (draft.phone) setVal(el.phone, draft.phone);
    if (draft.email) setVal(el.email, draft.email);
  }

  function applyTimeIfAvailable(timeStr) {
    if (!el.time || !timeStr) return;
    const opt = Array.from(el.time.options || []).find((o) => o.value === timeStr);
    if (opt && !opt.disabled) {
      el.time.value = timeStr;
    }
  }

  function redirectToLoginReturnHere() {
    window.location.href = `portal.html?returnTo=${encodeURIComponent("appointment.html")}`;
  }

  async function loadDoctors() {
    if (!el.specialty || !el.doctor) return;

    el.specialty.innerHTML = `<option value="">-- Select Specialty --</option>`;
    el.doctor.innerHTML = `<option value="">-- Select Doctor --</option>`;
    el.doctor.disabled = true;

    const res = await apiFetch("/api/doctors", { method: "GET" });
    if (!res.ok) throw new Error("Failed to load doctors");

    const data = await res.json().catch(() => null);

    const list = Array.isArray(data?.data?.items)
      ? data.data.items
      : Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data)
      ? data
      : Array.isArray(data?.doctors)
      ? data.doctors
      : [];

    allDoctors = list;
    specialtyToDoctors = new Map();

    list.forEach((d) => {
      const spec = String(d.specialty || "").trim();
      if (!spec) return;
      if (!specialtyToDoctors.has(spec)) specialtyToDoctors.set(spec, []);
      specialtyToDoctors.get(spec).push(d);
    });

    const specialties = Array.from(specialtyToDoctors.keys()).sort((a, b) =>
      a.localeCompare(b)
    );

    el.specialty.insertAdjacentHTML(
      "beforeend",
      specialties
        .map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`)
        .join("")
    );
  }

  function applyUrlPrefill() {
    const hasDoctorId = !!preselectDoctorId;
    let specialty = preselectSpecialty || "";

    if (hasDoctorId && !specialty) {
      const doctor = findDoctorById(preselectDoctorId);
      if (doctor?.specialty) {
        specialty = String(doctor.specialty);
      }
    }

    if (specialty && el.specialty) {
      setVal(el.specialty, specialty);
      onSpecialtyChange();
    }

    if (hasDoctorId && el.doctor) {
      const opts = Array.from(el.doctor.options || []);
      const match = opts.find(
        (o) => String(o.getAttribute("data-doctor-id") || "") === String(preselectDoctorId)
      );
      if (match) {
        el.doctor.value = match.value;
        el.doctor.disabled = false;
      }
    }

    if (hasDoctorId || specialty) {
      refreshTimeSlots();
    }
  }

  async function fetchWeeklyAvailability(doctorId) {
    if (!doctorId) return null;
    if (availabilityCache.has(doctorId)) return availabilityCache.get(doctorId);

    try {
      const res = await apiFetch(`/api/doctors/${doctorId}/availability`, { method: "GET" });
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      const weekly = data?.data?.weekly ?? data?.weekly;
      if (weekly && typeof weekly === "object") {
        availabilityCache.set(doctorId, weekly);
        return weekly;
      }
    } catch (e) {}

    return null;
  }

  async function fetchBookedSlots(doctorId, dateStr) {
    if (!doctorId || !dateStr) return [];
    try {
      const res = await apiFetch(
        `/api/appointments/slots?doctor_id=${encodeURIComponent(doctorId)}&date=${encodeURIComponent(dateStr)}`,
        { method: "GET" }
      );
      if (!res.ok) return [];
      const data = await res.json().catch(() => null);
      const items = Array.isArray(data?.data?.booked)
        ? data.data.booked
        : Array.isArray(data?.booked)
        ? data.booked
        : [];
      return items.map((t) => String(t || "").trim()).filter(Boolean);
    } catch (e) {}
    return [];
  }

  function resetTimeOptions() {
    if (!el.time) return;
    const opts = Array.from(el.time.options || []);
    opts.slice(1).forEach((o) => o.remove());
    el.time.value = "";
    el.time.disabled = true;
  }

  async function refreshTimeSlots() {
    if (!el.time) return;

    resetTimeOptions();

    const dateStr = enforceMinDate();
    const doctorId = getDoctorId();

    if (!dateStr || !doctorId) return;

    const weekly = await fetchWeeklyAvailability(doctorId);
    const dayKey = weekdayKey(dateStr);
    const availableDays = availableDaysFromWeekly(weekly);
    if (el.date) el.date.setCustomValidity("");

    if (availableDays && dayKey && !availableDays.includes(dayKey)) {
      if (el.date) {
        el.date.setCustomValidity(t("appt_doctor_unavailable_day", "Doctor is not available on this day."));
        el.date.reportValidity();
      }
      return;
    }

    const windows =
      weekly && dayKey && Array.isArray(weekly[dayKey])
        ? weekly[dayKey]
        : weekly
        ? []
        : DEFAULT_WINDOWS;

    const slots = buildSlotsFromWindows(windows);
    if (!slots.length) return;

    const booked = new Set(await fetchBookedSlots(doctorId, dateStr));
    const now = new Date();
    const isToday = dateStr === todayISO();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    slots.forEach((slot) => {
      const opt = document.createElement("option");
      opt.value = slot;
      opt.textContent = slot;

      const slotMinutes = timeToMinutes(slot);
      const isPastTime = isToday && slotMinutes <= nowMinutes;
      const isBooked = booked.has(slot);
      if (isPastTime || isBooked) opt.disabled = true;

      el.time.appendChild(opt);
    });

    el.time.disabled = false;
  }

  function onSpecialtyChange() {
    if (!el.specialty || !el.doctor) return;

    const chosen = val(el.specialty);

    el.doctor.innerHTML = `<option value="">-- Select Doctor --</option>`;
    el.doctor.disabled = true;
    resetTimeOptions();

    if (!chosen) return;

    const doctors = specialtyToDoctors.get(chosen) || [];
    if (!doctors.length) return;

    const opts = doctors
      .map((d) => {
        const id = d.id ?? d.doctor_id;
        const name = d.full_name || d.name || d.doctor || "";
        if (id == null || !name) return "";
        return `<option value="${escapeHtml(
          String(name)
        )}" data-doctor-id="${escapeHtml(String(id))}">${escapeHtml(
          String(name)
        )}</option>`;
      })
      .filter(Boolean)
      .join("");

    if (opts) {
      el.doctor.insertAdjacentHTML("beforeend", opts);
      el.doctor.disabled = false;
    }
  }

  function onDoctorChange() {
    refreshTimeSlots();
  }

  function onDateChange() {
    enforceMinDate();
    refreshTimeSlots();
  }

  function restoreDoctorSelectionFromDraft(draft) {
    if (!draft || !el.doctor) return;

    const targetId = draft.doctor_id != null ? String(draft.doctor_id) : "";
    const targetName = draft.doctor ? String(draft.doctor) : "";

    const opts = Array.from(el.doctor.options || []);
    const match =
      opts.find((o) => String(o.getAttribute("data-doctor-id") || "") === targetId) ||
      opts.find((o) => String(o.textContent || "").trim() === targetName);

    if (match) el.doctor.value = match.value;
  }

  async function confirmBooking() {
    const user = await getMe();

    const draftPayload = getPayloadFromUI();
    saveDraft(draftPayload);

    if (!user) {
      redirectToLoginReturnHere();
      return;
    }

    if (normRole(user.role) === "patient") applyPatientAutofill(user);

    const payload = getPayloadFromUI();

    const missing = [];
    if (!payload.specialty) missing.push("specialty");
    if (!payload.doctor) missing.push("doctor");
    if (!payload.doctor_id) missing.push("doctor_id");
    if (!payload.date) missing.push("date");
    if (!payload.time) missing.push("time");
    if (!payload.name) missing.push("name");
    if (!payload.phone) missing.push("phone");
    if (!payload.email) missing.push("email");

    if (missing.length) {
      notify(t("appt_missing_fields", "Missing required fields: ") + missing.join(", "));
      return;
    }

    const res = await apiFetch("/api/appointments", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (res.status === 401) {
      redirectToLoginReturnHere();
      return;
    }

    if (res.status === 403) {
      notify(t("appt_forbidden", "You are not allowed to create an appointment with this account."));
      return;
    }
    if (res.status === 409) {
      notify(t("appt_time_unavailable", "Selected time is no longer available. Please choose another slot."));
      await refreshTimeSlots();
      return;
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      notify(t("appt_error_booking", "Error booking appointment: ") + (txt || t("appt_unknown_error", "Unknown error")));
      return;
    }

    const data = await res.json().catch(() => null);
    if (data && data.success === true && data.data?.appointment) {
      clearDraft();
      window.location.href = "dashboard.html";
      return;
    }

    notify(t("appt_unexpected_response", "Appointment booked, but response was unexpected."), "info");
  }

  function bindNav() {
    if (el.prevBtn) {
      el.prevBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const prev = prevStepNumber(currentStep);
        if (prev >= 1) showStep(prev);
      });
    }

    if (el.nextBtn) {
      el.nextBtn.addEventListener("click", async (e) => {
        e.preventDefault();

        if (!validateStep(currentStep)) {
          notify(t("appt_complete_required", "Please complete the required fields."));
          return;
        }

        if (currentStep === 4) {
          await confirmBooking();
          return;
        }

        const next = nextStepNumber(currentStep);
        if (next === 4) buildReview();
        showStep(next);
      });
    }
  }

  async function init() {
    if (!api?.hasBase?.()) {
      notify(t("api_missing", "Service is temporarily unavailable."));
      return;
    }

    loggedUser = await getMe();
    if (!loggedUser) {
      redirectToLoginReturnHere();
      return;
    }

    const draft = loadDraft();

    try {
      await loadDoctors();
    } catch {
      notify(t("appt_doctors_load_error", "Unable to load doctors list."));
    }

    enforceMinDate();

    if (el.specialty) el.specialty.addEventListener("change", onSpecialtyChange);
    if (el.doctor) el.doctor.addEventListener("change", onDoctorChange);
    if (el.date) el.date.addEventListener("change", onDateChange);

    if (draft) {
      applyDraftToUI(draft);

      if (draft.specialty && el.specialty) {
        setVal(el.specialty, draft.specialty);
        onSpecialtyChange();
        restoreDoctorSelectionFromDraft(draft);
      }

      if (draft.date && el.date) {
        setVal(el.date, draft.date);
        enforceMinDate();
      }

      await refreshTimeSlots();
      applyTimeIfAvailable(draft.time);

      buildReview();
    }

    if (preselectDoctorId || preselectSpecialty) {
      applyUrlPrefill();
    }

    skipPatientStep = normRole(loggedUser?.role) === "patient";
    if (skipPatientStep) applyPatientAutofill(loggedUser);

    showStep(1);
    bindNav();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
