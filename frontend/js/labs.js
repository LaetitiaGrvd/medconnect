(() => {
  const api = window.MC_API;
  const t = window.MC_I18N?.t || ((_, fallback) => fallback);

  const anchorsEl = document.getElementById("labsAnchors");
  const listEl = document.getElementById("labsList");
  const statusEl = document.getElementById("labsStatus");
  const errorEl = document.getElementById("labsError");
  const errorMessageEl = document.getElementById("labsErrorMessage");
  const retryBtn = document.getElementById("labsRetry");
  const emptyEl = document.getElementById("labsEmpty");
  const defaultErrorMessage = t("labs_error", "Unable to load packages.");

  if (!anchorsEl || !listEl || !statusEl || !errorEl || !errorMessageEl || !retryBtn || !emptyEl) {
    return;
  }

  function formatPrice(value, currency) {
    const amount = Number(value || 0);
    const formatted = Number.isFinite(amount)
      ? amount.toLocaleString("en-MU")
      : "0";
    if (currency && currency !== "MUR") {
      return `${currency} ${formatted}`;
    }
    return `Rs ${formatted}`;
  }

  function pkgId(slug) {
    return `pkg-${slug}`;
  }

  function createAnchor(pkg) {
    const anchor = document.createElement("a");
    anchor.className = "labs-anchor";
    anchor.href = `#${pkgId(pkg.slug)}`;
    anchor.textContent = pkg.name;
    return anchor;
  }

  function createCard(pkg) {
    const card = document.createElement("article");
    card.className = "lab-card";
    card.id = pkgId(pkg.slug);

    const header = document.createElement("div");
    header.className = "lab-card__header";

    const title = document.createElement("h3");
    title.className = "lab-card__title";
    title.textContent = pkg.name;

    const price = document.createElement("div");
    price.className = "lab-card__price";
    price.textContent = formatPrice(pkg.price_mur, pkg.currency);

    header.appendChild(title);
    header.appendChild(price);

    const divider = document.createElement("div");
    divider.className = "lab-card__divider";

    const body = document.createElement("div");
    const label = document.createElement("div");
    label.className = "lab-card__label";
    label.textContent = t("labs_includes", "Includes");

    const list = document.createElement("ul");
    list.className = "lab-card__list";

    const contents = Array.isArray(pkg.contents) ? pkg.contents : [];
    const maxVisible = 8;
    const hasToggle = contents.length > maxVisible;

    contents.forEach((item, index) => {
      const li = document.createElement("li");
      li.textContent = item;
      if (hasToggle && index >= maxVisible) {
        li.classList.add("is-hidden");
      }
      list.appendChild(li);
    });

    body.appendChild(label);
    body.appendChild(list);

    if (hasToggle) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "lab-card__toggle";
      toggle.textContent = t("labs_show_all", "Show all");
      toggle.addEventListener("click", () => {
        const hiddenItems = list.querySelectorAll("li.is-hidden");
        const isExpanded = toggle.getAttribute("data-expanded") === "true";
        hiddenItems.forEach((li) => {
          li.classList.toggle("is-hidden", isExpanded);
        });
        toggle.setAttribute("data-expanded", isExpanded ? "false" : "true");
        toggle.textContent = isExpanded
          ? t("labs_show_all", "Show all")
          : t("labs_show_less", "Show less");
      });
      body.appendChild(toggle);
    }

    const footer = document.createElement("div");
    footer.className = "lab-card__footer";

    const note = document.createElement("div");
    note.className = "lab-card__note";
    note.textContent =
      pkg.preparation_note ||
      t("labs_preparation_default", "Preparation: not specified");

    const cta = document.createElement("a");
    cta.className = "lab-card__cta";
    const params = new URLSearchParams();
    params.set("package", pkg.name);
    if (pkg.category) {
      params.set("category", pkg.category);
    }
    cta.href = `request-quote.html?${params.toString()}`;
    cta.textContent = t("labs_request_quote", "Request quote");

    footer.appendChild(note);
    footer.appendChild(cta);

    card.appendChild(header);
    card.appendChild(divider);
    card.appendChild(body);
    card.appendChild(footer);

    return card;
  }

  function renderPackages(packages) {
    anchorsEl.innerHTML = "";
    listEl.innerHTML = "";

    packages.forEach((pkg) => {
      anchorsEl.appendChild(createAnchor(pkg));
      listEl.appendChild(createCard(pkg));
    });
  }

  function hideAllStates() {
    statusEl.classList.add("hidden");
    errorEl.classList.add("hidden");
    emptyEl.classList.add("hidden");
    anchorsEl.classList.add("hidden");
    listEl.classList.add("hidden");
  }

  function showLoading() {
    hideAllStates();
    statusEl.textContent = t("labs_loading", "Loading packages...");
    statusEl.classList.remove("hidden");
    anchorsEl.innerHTML = "";
    listEl.innerHTML = "";
  }

  function showError(message) {
    hideAllStates();
    errorMessageEl.textContent = message || defaultErrorMessage;
    errorEl.classList.remove("hidden");
    anchorsEl.innerHTML = "";
    listEl.innerHTML = "";
  }

  function showEmpty() {
    hideAllStates();
    emptyEl.classList.remove("hidden");
    anchorsEl.innerHTML = "";
    listEl.innerHTML = "";
  }

  function showSuccess(packages) {
    hideAllStates();
    renderPackages(packages);
    anchorsEl.classList.remove("hidden");
    listEl.classList.remove("hidden");
  }

  function highlightTarget(target) {
    if (!target) return;
    target.classList.add("is-highlight");
    setTimeout(() => target.classList.remove("is-highlight"), 1500);
  }

  anchorsEl.addEventListener("click", (event) => {
    const link = event.target.closest("a");
    if (!link || !link.hash) return;
    event.preventDefault();
    const id = link.hash.replace("#", "");
    const target = document.getElementById(id);
    if (!target) return;

    if ("scrollBehavior" in document.documentElement.style) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.location.hash = id;
    }
    highlightTarget(target);
  });

  async function loadPackages() {
    showLoading();
    if (!api?.hasBase?.()) {
      showError(t("api_missing", "Service is temporarily unavailable."));
      return;
    }
    try {
      const { ok, data } = await api.getJson("/api/lab-packages");
      if (!ok || !data || data.success !== true) {
        throw new Error(data?.error?.message || defaultErrorMessage);
      }
      const packages = Array.isArray(data.data) ? data.data : [];
      if (packages.length) {
        showSuccess(packages);
      } else {
        showEmpty();
      }
    } catch (err) {
      showError(err?.message || defaultErrorMessage);
    }
  }

  retryBtn.addEventListener("click", loadPackages);

  loadPackages();
})();
