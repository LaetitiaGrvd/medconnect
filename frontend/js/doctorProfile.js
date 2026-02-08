(() => {
  const api = window.MC_API;
  const t = window.MC_I18N?.t || ((_, fallback) => fallback);

  const params = new URLSearchParams(window.location.search);
  const doctorIdRaw = params.get("doctor_id");
  const doctorId = doctorIdRaw ? Number.parseInt(doctorIdRaw, 10) : null;

  const el = {
    heroName: document.getElementById("doctorHeroName"),
    heroSpecialty: document.getElementById("doctorHeroSpecialty"),
    avatar: document.getElementById("doctorAvatar"),
    name: document.getElementById("doctorName"),
    specialty: document.getElementById("doctorSpecialty"),
    hours: document.getElementById("doctorHours"),
    experienceList: document.getElementById("doctorExperience"),
    experienceEmpty: document.getElementById("doctorExperienceEmpty"),
    certsList: document.getElementById("doctorCertifications"),
    certsEmpty: document.getElementById("doctorCertsEmpty"),
    specsList: document.getElementById("doctorSpecialisations"),
    specsEmpty: document.getElementById("doctorSpecsEmpty"),
    bio: document.getElementById("doctorBio"),
    bookBtn: document.getElementById("doctorBookBtn"),
    content: document.getElementById("doctorProfileContent"),
    notFound: document.getElementById("doctorNotFound"),
  };

  const DEFAULT_AVATAR = "assets/img/default_avatar.jpg";
  const LOREM =
    "This doctor is committed to patient-centered care with a focus on prevention, clear communication, and evidence-based treatment. This profile will be updated with a full professional biography.";

  const DAY_LABELS = {
    mon: "Mon",
    tue: "Tue",
    wed: "Wed",
    thu: "Thu",
    fri: "Fri",
    sat: "Sat",
    sun: "Sun",
  };
  const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setText(node, value) {
    if (!node) return;
    node.textContent = value == null ? "" : String(value);
  }

  function show(node) {
    if (!node) return;
    node.hidden = false;
  }

  function hide(node) {
    if (!node) return;
    node.hidden = true;
  }

  function resolveAvatarUrl(url) {
    if (!url) return DEFAULT_AVATAR;
    if (/^https?:\/\//i.test(url)) return url;
    if (api?.buildUrl) return api.buildUrl(url);
    return url;
  }

  function normalizeDays(days) {
    if (!Array.isArray(days)) return [];
    const normalized = days
      .map((d) => String(d || "").trim().toLowerCase())
      .filter(Boolean);
    const ordered = DAY_ORDER.filter((d) => normalized.includes(d));
    const extras = normalized.filter((d) => !DAY_ORDER.includes(d));
    return ordered.concat(extras);
  }

  function formatDays(days) {
    return normalizeDays(days).map((d) => DAY_LABELS[d] || d);
  }

  function setList(listEl, emptyEl, items) {
    if (!listEl) return;
    const safeItems = Array.isArray(items) ? items.filter((v) => String(v || "").trim()) : [];
    if (!safeItems.length) {
      if (emptyEl) show(emptyEl);
      listEl.innerHTML = "";
      return;
    }
    if (emptyEl) hide(emptyEl);
    listEl.innerHTML = safeItems
      .map((item) => `<li>${escapeHtml(item)}</li>`)
      .join("");
  }

  function setHours(days, start, end) {
    const labels = formatDays(days);
    if (!labels.length || !start || !end) {
      setText(el.hours, t("doc_profile_not_specified", "Not specified"));
      return;
    }
    setText(el.hours, `${labels.join(", ")}: ${start}\u2013${end}`);
  }

  function showNotFound() {
    hide(el.content);
    show(el.notFound);
  }

  async function loadDoctor() {
    if (!doctorId || Number.isNaN(doctorId)) {
      showNotFound();
      return;
    }

    if (!api?.hasBase?.()) {
      showNotFound();
      return;
    }

    const { ok, data } = await api.getJson(`/api/doctors/${encodeURIComponent(doctorId)}`);
    if (!ok || !data || !data.success || !data.data) {
      showNotFound();
      return;
    }

    const doc = data.data;
    const name = doc.full_name || t("doc_profile_unknown", "Doctor");
    const specialty = doc.specialty || t("doc_profile_not_specified", "Not specified");

    setText(el.heroName, name);
    setText(el.heroSpecialty, specialty);
    setText(el.name, name);
    setText(el.specialty, specialty);

    if (el.avatar) {
      el.avatar.src = resolveAvatarUrl(doc.avatar_url);
      el.avatar.onerror = () => {
        el.avatar.onerror = null;
        el.avatar.src = DEFAULT_AVATAR;
      };
    }

    setHours(doc.availability_days || [], doc.availability_start, doc.availability_end);
    setList(el.experienceList, el.experienceEmpty, doc.experience || []);
    setList(el.certsList, el.certsEmpty, doc.certifications || []);
    setList(el.specsList, el.specsEmpty, doc.specialisations || []);

    const bio = String(doc.bio || "").trim();
    setText(el.bio, bio || LOREM);

    if (el.bookBtn) {
      const specParam = doc.specialty ? encodeURIComponent(doc.specialty) : "";
      el.bookBtn.href = `appointment.html?doctor_id=${encodeURIComponent(doc.id)}&specialty=${specParam}`;
    }
  }

  document.addEventListener("DOMContentLoaded", loadDoctor);
})();
