(() => {
  const STATUS_OPTIONS = ["new", "in_review", "contacted", "closed"];

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

  function formatDate(value) {
    if (!value) return "";
    const raw = String(value);
    if (raw.includes("T")) return raw.split("T")[0];
    return raw.slice(0, 10);
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

  function initSection({ apiBase, el, sectionRoot }) {
    if (!sectionRoot) return;

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

    sectionRoot.innerHTML = `
      <div class="dash-section__head">
        <h2>Quote Requests</h2>
        <div class="dash-filters">
          <label>
            Status
            <select id="quoteStatusFilter">
              <option value="">All</option>
              ${STATUS_OPTIONS.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("")}
            </select>
          </label>
          <label>
            Search
            <input type="text" id="quoteSearch" placeholder="Name, email, phone" />
          </label>
          <label>
            From
            <input type="date" id="quoteFrom" />
          </label>
          <label>
            To
            <input type="date" id="quoteTo" />
          </label>
          <button class="btn ghost" id="quoteApply">Apply</button>
          <button class="btn ghost" id="quoteExport">Export CSV</button>
        </div>
      </div>
      <div class="dash-loading" data-role="loading">Loading...</div>
      <div class="dash-error hidden" data-role="error"></div>
      <div class="dash-empty hidden" data-role="empty">No quote requests found.</div>
      <div class="table-wrap hidden" data-role="table">
        <table class="mc-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Categories</th>
              <th>Preferred Doctor</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody data-role="tbody"></tbody>
        </table>
      </div>
    `;

    const section = sectionEls(sectionRoot);
    const statusFilter = sectionRoot.querySelector("#quoteStatusFilter");
    const searchInput = sectionRoot.querySelector("#quoteSearch");
    const fromInput = sectionRoot.querySelector("#quoteFrom");
    const toInput = sectionRoot.querySelector("#quoteTo");
    const applyBtn = sectionRoot.querySelector("#quoteApply");
    const exportBtn = sectionRoot.querySelector("#quoteExport");

    const state = {
      items: [],
      map: new Map(),
    };

    function render(items) {
      if (!Array.isArray(items) || items.length === 0) {
        setSectionEmpty(section, "No quote requests found.");
        return;
      }

      setSectionTable(section);
      state.map.clear();

      const rows = items.map((item) => {
        const categories = Array.isArray(item.categories) ? item.categories.join(", ") : "";
        state.map.set(String(item.id), item);
        return `
          <tr>
            <td>${escapeHtml(formatDate(item.created_at))}</td>
            <td>${escapeHtml(item.full_name || "")}</td>
            <td>${escapeHtml(item.email || "")}</td>
            <td>${escapeHtml(item.phone || "")}</td>
            <td>${escapeHtml(categories)}</td>
            <td>${escapeHtml(item.preferred_doctor || "--")}</td>
            <td>${escapeHtml(item.status || "new")}</td>
            <td>
              <button type="button" class="btn ghost" data-action="view" data-id="${escapeHtml(String(item.id))}" style="padding:8px 12px; border-width:1px;">View</button>
            </td>
          </tr>
        `;
      });

      if (section.tbody) section.tbody.innerHTML = rows.join("");
    }

    async function loadList() {
      setSectionLoading(section);

      const params = new URLSearchParams();
      const status = statusFilter?.value || "";
      const q = searchInput?.value || "";
      const from = fromInput?.value || "";
      const to = toInput?.value || "";

      if (status) params.set("status", status);
      if (q) params.set("q", q);
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const res = await apiFetch(`/api/admin/quote-requests?${params.toString()}`, { method: "GET" });
      if (!res.ok) {
        setSectionError(section, "Unable to load quote requests.");
        return;
      }

      const payload = await res.json().catch(() => null);
      const items = payload?.data?.items || [];
      state.items = items;
      render(items);
    }

    function downloadQuoteCsv() {
      const params = new URLSearchParams();
      const status = statusFilter?.value || "";
      const q = searchInput?.value || "";
      const from = fromInput?.value || "";
      const to = toInput?.value || "";

      if (status) params.set("status", status);
      if (q) params.set("q", q);
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const qs = params.toString();
      const url = `${apiBase}/api/admin/quote-requests/export${qs ? `?${qs}` : ""}`;
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    }

    async function openQuoteModal(id) {
      const res = await apiFetch(`/api/admin/quote-requests/${encodeURIComponent(id)}`, { method: "GET" });
      if (!res.ok) {
        alert("Unable to load quote request details.");
        return;
      }

      const payload = await res.json().catch(() => null);
      const details = payload?.data?.request;
      const files = payload?.data?.files || [];
      if (!details) {
        alert("Unable to load quote request details.");
        return;
      }

      const rows = [
        ["Name", `${details.first_name || ""} ${details.last_name || ""}`.trim()],
        ["Gender", details.gender || ""],
        ["Date of birth", details.dob || ""],
        ["Email", details.email || ""],
        ["Phone", details.phone || ""],
        ["Service categories", (details.service_categories || []).join(", ")],
        ["Preferred doctor", details.preferred_doctor || "--"],
        ["Message", details.message || ""],
        ["Created", formatDate(details.created_at)],
      ].filter(([, v]) => String(v || "").trim());

      const docs = files.filter((f) => f.kind === "documents");
      const ids = files.filter((f) => f.kind === "id");

      const filesSection = `
        <div class="dash-form__row">
          <label>Supporting Documents</label>
          <div class="dash-form">
            ${docs.length
              ? docs
                  .map(
                    (f) => `
                      <div class="dash-inline">
                        <span>${escapeHtml(f.original_filename || "")}</span>
                        <a class="btn ghost" style="padding:6px 10px; border-width:1px;" href="${escapeHtml(f.download_url)}">Download</a>
                      </div>
                    `
                  )
                  .join("")
              : "<span>No documents.</span>"}
          </div>
        </div>
        <div class="dash-form__row">
          <label>Identity Document</label>
          <div class="dash-form">
            ${ids.length
              ? ids
                  .map(
                    (f) => `
                      <div class="dash-inline">
                        <span>${escapeHtml(f.original_filename || "")}</span>
                        <a class="btn ghost" style="padding:6px 10px; border-width:1px;" href="${escapeHtml(f.download_url)}">Download</a>
                      </div>
                    `
                  )
                  .join("")
              : "<span>No identity document.</span>"}
          </div>
        </div>
      `;

      const statusOptions = STATUS_OPTIONS.map((s) => {
        const selected = s === details.status ? "selected" : "";
        return `<option value="${escapeHtml(s)}" ${selected}>${escapeHtml(s)}</option>`;
      }).join("");

      const body = `
        ${buildKvRows(rows)}
        <div class="dash-form" style="margin-top:14px;">
          <div class="dash-form__row">
            <label for="quoteStatusSelect">Status</label>
            <select id="quoteStatusSelect">${statusOptions}</select>
          </div>
          <div class="dash-form__row">
            <label for="quoteNotes">Admin notes</label>
            <textarea id="quoteNotes" rows="4">${escapeHtml(details.admin_notes || "")}</textarea>
          </div>
          <div class="dash-error hidden" id="quoteUpdateError"></div>
          ${filesSection}
        </div>
      `;

      const footer = `
        <button type="button" class="btn ghost" data-close="true">Close</button>
        <button type="button" class="btn primary" data-action="save-quote">Save</button>
      `;

      el.openModal({ title: "Quote request", body, footer });

      const modalRoot = el.modal.root;
      const saveBtn = modalRoot.querySelector('[data-action="save-quote"]');
      const statusSelect = modalRoot.querySelector("#quoteStatusSelect");
      const notesInput = modalRoot.querySelector("#quoteNotes");
      const errorBox = modalRoot.querySelector("#quoteUpdateError");

      const showError = (msg) => {
        if (errorBox) {
          errorBox.textContent = msg;
          errorBox.classList.remove("hidden");
        }
      };

      if (saveBtn) {
        saveBtn.addEventListener("click", async () => {
        if (errorBox) errorBox.classList.add("hidden");

          const status = statusSelect?.value || "";
          const admin_notes = notesInput?.value || "";

          saveBtn.disabled = true;
          saveBtn.textContent = "Saving...";

          const resUpdate = await apiFetch(`/api/admin/quote-requests/${encodeURIComponent(details.id)}`, {
            method: "PATCH",
            body: JSON.stringify({ status, admin_notes }),
          });

          saveBtn.disabled = false;
          saveBtn.textContent = "Save";

          if (!resUpdate.ok) {
            const errData = await resUpdate.json().catch(() => null);
            showError(errData?.error?.message || "Unable to save updates.");
            return;
          }

          const data = await resUpdate.json().catch(() => null);
          if (!data || data.success !== true) {
            showError("Unable to save updates.");
            return;
          }

          el.closeModal();
          loadList();
        });
      }
    }

    sectionRoot.addEventListener("click", (e) => {
      const t = e.target;
      if (!t) return;
      const viewBtn = t.closest && t.closest("[data-action='view']");
      if (viewBtn) {
        const id = viewBtn.getAttribute("data-id");
        if (id) openQuoteModal(id);
      }
    });

    if (applyBtn) applyBtn.addEventListener("click", loadList);
    if (exportBtn) {
      exportBtn.addEventListener("click", (e) => {
        e.preventDefault();
        downloadQuoteCsv();
      });
    }

    loadList();
  }

  window.DashboardsAdminQuoteRequests = { initSection };
})();
