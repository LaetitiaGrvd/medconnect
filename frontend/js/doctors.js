document.addEventListener("DOMContentLoaded", () => {
  const listEl = document.getElementById("doctorList");
  const searchInput = document.getElementById("doctorSearch");
  const specialtyFilter = document.getElementById("specialtyFilter");

  if (!listEl || !searchInput || !specialtyFilter) return;

  let doctors = [];
  const DEFAULT_AVATAR = "assets/img/default_avatar.jpg";
  const api = window.MC_API;
  const t = window.MC_I18N?.t || ((_, fallback) => fallback);
  const API_BASE = api?.API_BASE || "";

  function normalize(str) {
    return String(str || "").trim().toLowerCase();
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function resolveAvatarUrl(url) {
    if (!url) return DEFAULT_AVATAR;
    if (/^https?:\/\//i.test(url)) return url;
    if (!API_BASE) return url.startsWith("/") ? url : `/${url}`;
    return url.startsWith("/") ? `${API_BASE}${url}` : `${API_BASE}/${url}`;
  }

  function buildSpecialtyFilter(items) {
    const unique = [...new Set(items.map(d => normalize(d.specialty)))].filter(Boolean);

    const currentPlaceholder =
      specialtyFilter.querySelector('option[value=""]')?.textContent || "All Specialties";

    specialtyFilter.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = currentPlaceholder;
    placeholder.setAttribute("data-i18n", "filter_all");
    specialtyFilter.appendChild(placeholder);

    unique.forEach(spec => {
      const opt = document.createElement("option");
      opt.value = spec;
      const label = items.find(d => normalize(d.specialty) === spec)?.specialty || spec;
      opt.textContent = label;
      specialtyFilter.appendChild(opt);
    });
  }

  function getFilteredDoctors() {
    const q = normalize(searchInput.value);
    const spec = normalize(specialtyFilter.value);

    return doctors.filter(d => {
      const name = normalize(d.full_name);
      const specialty = normalize(d.specialty);

      const matchesSearch = !q || name.includes(q);
      const matchesSpecialty = !spec || specialty === spec;

      return matchesSearch && matchesSpecialty;
    });
  }

  function render(items) {
    if (!items.length) {
      listEl.innerHTML = `<p>${t("doctors_empty", "No doctors found.")}</p>`;
      return;
    }

    listEl.innerHTML = items.map(d => {
      const id = Number(d.id);
      const name = escapeHtml(d.full_name);
      const specialty = escapeHtml(d.specialty);

      const bookUrl =
        `appointment.html?specialty=${encodeURIComponent(d.specialty)}&doctor_id=${id}`;
      const profileUrl = `doctor-profile.html?doctor_id=${id}`;

      const avatarUrl = resolveAvatarUrl(d.avatar_url);

      return `
        <article class="doctor-card" data-specialty="${normalize(d.specialty)}">
          <img src="${avatarUrl}" alt="${name}" class="doctor-photo" onerror="this.onerror=null;this.src='${DEFAULT_AVATAR}';">
          <h3>${name}</h3>
          <p>${specialty}</p>
          <div class="doctor-card__actions">
            <a href="${profileUrl}" class="btn ghost">${t("btn_view_profile", "View Profile")}</a>
            <a href="${bookUrl}" class="btn primary">${t("btn_book", "Book")}</a>
          </div>
        </article>
      `;
    }).join("");
  }

  function refresh() {
    render(getFilteredDoctors());
  }

  async function init() {
    if (!api?.hasBase?.()) {
      listEl.innerHTML = `<p>${t("api_missing", "Service is temporarily unavailable.")}</p>`;
      return;
    }

    try {
      const { ok, data } = await api.getJson("/api/doctors");
      if (!ok) throw new Error("Doctors API failed");

      const payload = data;
      doctors = Array.isArray(payload?.data?.items)
        ? payload.data.items
        : Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.items)
        ? payload.items
        : [];
      buildSpecialtyFilter(doctors);
      refresh();
    } catch (err) {
      console.error(err);
      listEl.innerHTML = `<p>${t("doctors_load_error", "Unable to load doctors.")}</p>`;
    }
  }

  searchInput.addEventListener("input", refresh);
  specialtyFilter.addEventListener("change", refresh);

  init();
});
