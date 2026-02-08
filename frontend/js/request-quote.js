(() => {
  const api = window.MC_API;
  const t = window.MC_I18N?.t || ((_, fallback) => fallback);

  const form = document.getElementById("quoteForm");
  if (!form) return;

  const el = {
    success: document.getElementById("quoteSuccess"),
    error: document.getElementById("quoteError"),
    firstName: document.getElementById("firstName"),
    lastName: document.getElementById("lastName"),
    gender: document.getElementById("gender"),
    dob: document.getElementById("dob"),
    phone: document.getElementById("phone"),
    email: document.getElementById("email"),
    doctor: document.getElementById("doctorSelect"),
    message: document.getElementById("message"),
    consent: document.getElementById("consent"),
    docsInput: document.getElementById("documentsInput"),
    docsDrop: document.getElementById("documentsDrop"),
    docsBtn: document.getElementById("documentsUploadBtn"),
    docsList: document.getElementById("documentsList"),
    idInput: document.getElementById("idDocumentInput"),
    idDrop: document.getElementById("idDocumentDrop"),
    idBtn: document.getElementById("idUploadBtn"),
    idList: document.getElementById("idList"),
  };

  const ALLOWED_EXTS = [".pdf", ".jpg", ".jpeg", ".png"];
  const MAX_FILE_SIZE = 5 * 1024 * 1024;

  function show(node, message) {
    if (!node) return;
    if (message != null) node.textContent = message;
    node.hidden = false;
  }

  function hide(node) {
    if (!node) return;
    node.hidden = true;
    node.textContent = "";
  }

  function setError(field, message) {
    const target = document.querySelector(`[data-error-for="${field}"]`);
    if (!target) return;
    if (!message) {
      target.textContent = "";
      target.hidden = true;
      return;
    }
    target.textContent = message;
    target.hidden = false;
  }

  function clearErrors() {
    document.querySelectorAll(".rq-error").forEach((node) => {
      node.textContent = "";
      node.hidden = true;
    });
  }

  function normalizePhone(value) {
    return String(value || "").trim();
  }

  function phoneDigitCount(value) {
    return (value || "").replace(/\D/g, "").length;
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value || "");
  }

  function validateFile(file) {
    if (!file) return t("rq_file_required", "File is required");
    const name = String(file.name || "").toLowerCase();
    const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
    if (!ALLOWED_EXTS.includes(ext)) {
      return t("rq_file_types", "Accepted file types: pdf, jpg, jpeg, png.");
    }
    if (file.size > MAX_FILE_SIZE) {
      return t("rq_file_size", "File exceeds 5 MB.");
    }
    if (file.size <= 0) {
      return t("rq_file_empty", "File is empty.");
    }
    return null;
  }

  function initUploader({ input, drop, button, list, errorKey, multiple }) {
    let files = [];

    function render() {
      if (!list) return;
      if (!files.length) {
        list.innerHTML = "";
        return;
      }
      list.innerHTML = files
        .map(
          (file, idx) => `
            <div class="rq-file">
              <span>${escapeHtml(file.name)}</span>
              <button type="button" data-remove="${idx}">Remove</button>
            </div>
          `
        )
        .join("");
    }

    function addFiles(incoming) {
      const incomingFiles = Array.from(incoming || []);
      if (!incomingFiles.length) return;

      if (!multiple) {
        if (incomingFiles.length > 1) {
          setError(errorKey, t("rq_only_one_file", "Only one file is allowed."));
        }
        files = [];
        const first = incomingFiles[0];
        if (first) {
          const err = validateFile(first);
          if (err) {
            setError(errorKey, err);
          } else {
            files.push(first);
          }
        }
        render();
        return;
      }

      incomingFiles.forEach((file) => {
        if (!file) return;
        const err = validateFile(file);
        if (err) {
          setError(errorKey, err);
          return;
        }
        files.push(file);
      });

      render();
    }

    function clear() {
      files = [];
      render();
    }

    if (button && input) {
      button.addEventListener("click", () => input.click());
    }

    if (input) {
      input.addEventListener("change", () => {
        setError(errorKey, "");
        addFiles(input.files);
        input.value = "";
      });
    }

    if (drop) {
      ["dragenter", "dragover"].forEach((evt) => {
        drop.addEventListener(evt, (e) => {
          e.preventDefault();
          drop.classList.add("is-dragover");
        });
      });
      ["dragleave", "drop"].forEach((evt) => {
        drop.addEventListener(evt, (e) => {
          e.preventDefault();
          drop.classList.remove("is-dragover");
        });
      });
      drop.addEventListener("drop", (e) => {
        setError(errorKey, "");
        addFiles(e.dataTransfer.files);
      });
    }

    if (list) {
      list.addEventListener("click", (e) => {
        const target = e.target;
        if (!target) return;
        const idx = target.getAttribute("data-remove");
        if (idx == null) return;
        const index = Number(idx);
        if (Number.isNaN(index)) return;
        files.splice(index, 1);
        render();
      });
    }

    return {
      getFiles: () => files.slice(),
      clear,
    };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  const docsUploader = initUploader({
    input: el.docsInput,
    drop: el.docsDrop,
    button: el.docsBtn,
    list: el.docsList,
    errorKey: "documents",
    multiple: true,
  });

  const idUploader = initUploader({
    input: el.idInput,
    drop: el.idDrop,
    button: el.idBtn,
    list: el.idList,
    errorKey: "id_document",
    multiple: false,
  });

  function getCheckedCategories() {
    return Array.from(
      form.querySelectorAll('input[name="service_categories"]:checked')
    ).map((input) => input.value);
  }

  function validateForm() {
    let valid = true;

    const first = el.firstName?.value.trim();
    const last = el.lastName?.value.trim();
    const gender = el.gender?.value.trim();
    const dob = el.dob?.value.trim();
    const phone = normalizePhone(el.phone?.value || "");
    const email = (el.email?.value || "").trim();
    const message = (el.message?.value || "").trim();
    const categories = getCheckedCategories();
    const consent = !!el.consent?.checked;
    const docs = docsUploader.getFiles();
    const idDocs = idUploader.getFiles();

    if (!first) {
      setError("first_name", t("rq_first_required", "First name is required."));
      valid = false;
    }

    if (!last) {
      setError("last_name", t("rq_last_required", "Last name is required."));
      valid = false;
    }

    if (!gender) {
      setError("gender", t("rq_gender_required", "Gender is required."));
      valid = false;
    }

    if (!dob) {
      setError("dob", t("rq_dob_required", "Date of birth is required."));
      valid = false;
    }

    if (!phone) {
      setError("phone", t("rq_phone_required", "Phone number is required."));
      valid = false;
    } else if (!/^[0-9+()\-\s]+$/.test(phone) || phoneDigitCount(phone) < 7) {
      setError("phone", t("rq_phone_invalid", "Enter a valid phone number."));
      valid = false;
    }

    if (!email) {
      setError("email", t("rq_email_required", "Email is required."));
      valid = false;
    } else if (!isValidEmail(email)) {
      setError("email", t("rq_email_invalid", "Enter a valid email address."));
      valid = false;
    }

    if (!categories.length) {
      setError(
        "service_categories",
        t("rq_categories_required", "Select at least one service category.")
      );
      valid = false;
    }

    if (!message) {
      setError("message", t("rq_message_required", "Message is required."));
      valid = false;
    }

    if (!consent) {
      setError("consent", t("rq_consent_required", "Consent is required."));
      valid = false;
    }

    if (idDocs.length !== 1) {
      setError(
        "id_document",
        t("rq_id_required", "Identity document is required.")
      );
      valid = false;
    } else {
      const err = validateFile(idDocs[0]);
      if (err) {
        setError("id_document", err);
        valid = false;
      }
    }

    for (const doc of docs) {
      const err = validateFile(doc);
      if (err) {
        setError("documents", err);
        valid = false;
        break;
      }
    }

    return valid;
  }

  function bindClearOnInput() {
    const fields = [
      "first_name",
      "last_name",
      "gender",
      "dob",
      "phone",
      "email",
      "message",
      "service_categories",
      "consent",
      "doctor_id",
    ];

    fields.forEach((field) => {
      const nodes = document.querySelectorAll(`[data-clear-for="${field}"]`);
      nodes.forEach((node) => {
        node.addEventListener("input", () => setError(field, ""));
        node.addEventListener("change", () => setError(field, ""));
      });
    });
  }

  function prefillFromParams() {
    const params = new URLSearchParams(window.location.search);
    const pkg = (params.get("package") || "").trim();
    const category = (params.get("category") || "").trim();

    if (category) {
      const checkboxes = Array.from(
        form.querySelectorAll('input[name="service_categories"]')
      );
      const match = checkboxes.find(
        (input) => String(input.value || "").trim().toLowerCase() === category.toLowerCase()
      );

      if (match) {
        match.checked = true;
      } else {
        const other = checkboxes.find(
          (input) => String(input.value || "").trim().toLowerCase() === "other"
        );
        if (other) other.checked = true;
      }
    }

    if (pkg && el.message) {
      const current = (el.message.value || "").trim();
      const prefix = `Package: ${pkg}`;
      if (!current.toLowerCase().startsWith("package:")) {
        el.message.value = current ? `${prefix}\n${current}` : prefix;
      }
    }
  }

  async function loadDoctors() {
    if (!el.doctor) return;
    try {
      if (!api?.hasBase?.()) return;
      const { ok, data } = await api.getJson("/api/doctors?active=1");
      if (!ok || !Array.isArray(data)) return;

      data.forEach((doc) => {
        const opt = document.createElement("option");
        opt.value = String(doc.id);
        opt.textContent = `Dr ${doc.full_name || ""} - ${doc.specialty || ""}`.trim();
        el.doctor.appendChild(opt);
      });
    } catch (e) {}
  }

  async function handleSubmit(e) {
    e.preventDefault();
    hide(el.success);
    hide(el.error);
    clearErrors();

    if (!validateForm()) return;

    const formData = new FormData();
    formData.append("first_name", el.firstName.value.trim());
    formData.append("last_name", el.lastName.value.trim());
    formData.append("gender", el.gender.value.trim());
    formData.append("dob", el.dob.value.trim());
    formData.append("phone", normalizePhone(el.phone.value));
    formData.append("email", el.email.value.trim());
    formData.append("message", el.message.value.trim());

    const doctorId = el.doctor?.value || "";
    if (doctorId) formData.append("doctor_id", doctorId);

    getCheckedCategories().forEach((value) => {
      formData.append("service_categories", value);
    });

    docsUploader.getFiles().forEach((file) => {
      formData.append("documents", file);
    });

    const idDocs = idUploader.getFiles();
    if (idDocs.length) {
      formData.append("id_document", idDocs[0]);
    }

    const submitBtn = form.querySelector("button[type='submit']");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = t("rq_submitting", "Submitting...");
    }

    try {
      if (!api?.hasBase?.()) {
        show(el.error, t("api_missing", "Service is temporarily unavailable."));
        return;
      }

      const res = await api.apiFetch("/api/quote-requests", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data || data.success !== true) {
        const fieldErrors = data?.error?.field_errors || {};
        Object.entries(fieldErrors).forEach(([key, message]) => {
          setError(key, message);
        });
        show(el.error, data?.error?.message || t("rq_submit_error", "Unable to submit request."));
        return;
      }

      show(el.success, t("rq_submit_success", "Request submitted successfully."));
      form.reset();
      docsUploader.clear();
      idUploader.clear();
    } catch (err) {
      show(el.error, t("rq_submit_error", "Unable to submit request."));
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = t("rq_submit", "Submit");
      }
    }
  }

  bindClearOnInput();
  prefillFromParams();
  loadDoctors();
  form.addEventListener("submit", handleSubmit);
})();
