document.addEventListener("DOMContentLoaded", () => {
  const sideMenu = document.getElementById("sideMenu");
  const overlay = document.getElementById("sideMenuOverlay");
  const openBtn = document.querySelector(".hamburger");
  const closeBtn = document.getElementById("closeMenu");
  const firstLink = sideMenu.querySelector("ul li a");
  const langSwitch = document.querySelector(".lang-switch");
  const api = window.MC_API;
  const t = window.MC_I18N?.t || ((_, fallback) => fallback);

  let userLink = document.getElementById("mcUserLink");
  if (langSwitch && !userLink) {
    userLink = document.createElement("a");
    userLink.id = "mcUserLink";
    userLink.className = "mc-user-link";
    userLink.href = "dashboard.html";
    userLink.hidden = true;
    userLink.innerHTML = `<i class="fi fi-rr-user" aria-hidden="true"></i><span>${t(
      "nav_account",
      "Account"
    )}</span>`;
    userLink.setAttribute("aria-label", t("nav_account", "Account"));
    langSwitch.prepend(userLink);
  }

  function trapFocus(e) {
    const focusable = sideMenu.querySelectorAll('a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
    const firstEl = focusable[0];
    const lastEl = focusable[focusable.length - 1];

    if (e.key === "Tab") {
      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        // Tab forward
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    }
  }

  function openMenu() {
    sideMenu.classList.add("active");
    overlay.classList.add("active");
    sideMenu.setAttribute("aria-hidden", "false");
    overlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    // Focus on first link
    if (firstLink) firstLink.focus();

    // Enable focus trap
    document.addEventListener("keydown", trapFocus);
  }

  function closeMenu() {
    sideMenu.classList.remove("active");
    overlay.classList.remove("active");
    sideMenu.setAttribute("aria-hidden", "true");
    overlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";

    // Return focus to hamburger
    if (openBtn) openBtn.focus();

    // Disable focus trap
    document.removeEventListener("keydown", trapFocus);
  }

  if (openBtn && sideMenu && closeBtn && overlay) {
    openBtn.addEventListener("click", openMenu);
    closeBtn.addEventListener("click", closeMenu);
    overlay.addEventListener("click", closeMenu);

    // ESC key closes menu
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && sideMenu.classList.contains("active")) {
        closeMenu();
      }
    });
  }

  async function hydrateUser() {
    if (!userLink || !api?.hasBase?.()) return;
    try {
      const { ok, data } = await api.getJson("/api/me");
      if (!ok || !data || data.success !== true || !data.data?.user) return;
      const user = data.data.user;
      const label = user.name || user.full_name || user.email || t("nav_account", "Account");
      const labelText = label;
      const labelEl = userLink.querySelector("span");
      if (labelEl) {
        labelEl.textContent = labelText;
      } else {
        userLink.textContent = labelText;
      }
      userLink.title = user.email || labelText;
      userLink.hidden = false;
    } catch (e) {}
  }

  hydrateUser();
});
