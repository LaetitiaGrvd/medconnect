document.addEventListener("DOMContentLoaded", () => {
  const langButtons = document.querySelectorAll(".lang-switch button");
  const defaultLang = "en";
  let currentLang = localStorage.getItem("lang") || defaultLang;
  let translations = {};

  function t(key, fallback) {
    const value = translations[key];
    if (value != null && String(value).trim()) return String(value);
    return fallback;
  }

  function expose() {
    window.MC_I18N = {
      t,
      getLang: () => currentLang,
      loadLanguage,
    };
  }

  // Load translations from JSON
  function loadLanguage(lang) {
    fetch(`lang/${lang}.json`)
      .then(res => res.json())
      .then(data => {
        translations = data || {};
        document.querySelectorAll("[data-i18n], [data-i18n-placeholder]").forEach(el => {
          // For placeholders
          if (el.hasAttribute("data-i18n-placeholder")) {
            const key = el.getAttribute("data-i18n-placeholder");
            if (data[key]) {
              el.setAttribute("placeholder", data[key]);
            }
          }

          // For normal text content
          if (el.hasAttribute("data-i18n")) {
            const key = el.getAttribute("data-i18n");
            if (data[key]) {
              el.textContent = data[key];
            }
          }
        });

        // Update active button state
        langButtons.forEach(btn => {
          btn.setAttribute("aria-pressed", btn.dataset.lang === lang ? "true" : "false");
        });

        // Save selection
        localStorage.setItem("lang", lang);
        currentLang = lang;
        expose();
      })
      .catch(err => console.error("Translation load error:", err));
  }

  // Init
  loadLanguage(currentLang);

  // Button click listener
  langButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const lang = btn.dataset.lang;
      if (lang !== currentLang) {
        loadLanguage(lang);
      }
    });
  });
});
