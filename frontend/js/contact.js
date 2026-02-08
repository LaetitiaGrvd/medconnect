(() => {
  const api = window.MC_API;
  const t = window.MC_I18N?.t || ((_, fallback) => fallback);

  const form = document.getElementById("contactForm");
  if (!form) return;

  const el = {
    success: document.getElementById("contactSuccess"),
    error: document.getElementById("contactError"),
    type: document.getElementById("contactType"),
    firstName: document.getElementById("firstName"),
    lastName: document.getElementById("lastName"),
    email: document.getElementById("email"),
    phone: document.getElementById("phone"),
    message: document.getElementById("message"),
    consent: document.getElementById("consent"),
    submit: form.querySelector("button[type='submit']"),
  };

  const ALLOWED_TYPES = new Set([
    "General enquiry",
    "Billing",
    "Appointment support",
    "Technical issue",
    "Feedback",
    "Other",
  ]);

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
      return;
    }
    target.textContent = message;
  }

  function clearErrors() {
    document.querySelectorAll(".contact-error").forEach((node) => {
      node.textContent = "";
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

  function validateForm() {
    let valid = true;

    const type = (el.type?.value || "").trim();
    const first = (el.firstName?.value || "").trim();
    const last = (el.lastName?.value || "").trim();
    const email = (el.email?.value || "").trim();
    const phone = normalizePhone(el.phone?.value || "");
    const message = (el.message?.value || "").trim();
    const consent = !!el.consent?.checked;

    if (!type) {
      setError("type", t("contact_type_required", "Type is required."));
      valid = false;
    } else if (!ALLOWED_TYPES.has(type)) {
      setError("type", t("contact_type_invalid", "Select a valid enquiry type."));
      valid = false;
    }

    if (!first) {
      setError("first_name", t("contact_first_required", "First name is required."));
      valid = false;
    }

    if (!last) {
      setError("last_name", t("contact_last_required", "Last name is required."));
      valid = false;
    }

    if (!email) {
      setError("email", t("contact_email_required", "Email is required."));
      valid = false;
    } else if (!isValidEmail(email)) {
      setError("email", t("contact_email_invalid", "Enter a valid email address."));
      valid = false;
    }

    if (!phone) {
      setError("phone", t("contact_phone_required", "Phone number is required."));
      valid = false;
    } else if (!/^[0-9+()\-\s]+$/.test(phone) || phoneDigitCount(phone) < 7) {
      setError("phone", t("contact_phone_invalid", "Enter a valid phone number."));
      valid = false;
    }

    if (!message) {
      setError("message", t("contact_message_required", "Message is required."));
      valid = false;
    }

    if (!consent) {
      setError("consent", t("contact_consent_required", "Consent is required."));
      valid = false;
    }

    return valid;
  }

  function bindClearOnInput() {
    const fields = [
      "type",
      "first_name",
      "last_name",
      "email",
      "phone",
      "message",
      "consent",
    ];

    fields.forEach((field) => {
      const nodes = document.querySelectorAll(`[data-clear-for="${field}"]`);
      nodes.forEach((node) => {
        node.addEventListener("input", () => setError(field, ""));
        node.addEventListener("change", () => setError(field, ""));
      });
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    hide(el.success);
    hide(el.error);
    clearErrors();

    if (!validateForm()) return;

    const payload = {
      type: (el.type?.value || "").trim(),
      first_name: (el.firstName?.value || "").trim(),
      last_name: (el.lastName?.value || "").trim(),
      email: (el.email?.value || "").trim(),
      phone: normalizePhone(el.phone?.value || ""),
      message: (el.message?.value || "").trim(),
      consent: true,
    };

    if (el.submit) {
      el.submit.disabled = true;
      el.submit.textContent = t("contact_sending", "Sending...");
    }

    try {
      if (!api?.hasBase?.()) {
        show(el.error, t("api_missing", "Service is temporarily unavailable."));
        return;
      }

      const { ok, data } = await api.postJson("/api/contact", payload);

      if (!ok || !data || data.success !== true) {
        const fieldErrors = data?.error?.field_errors || {};
        Object.entries(fieldErrors).forEach(([key, message]) => {
          setError(key, message);
        });
        show(el.error, data?.error?.message || t("contact_error", "Unable to send message."));
        return;
      }

      show(el.success, t("contact_success", "Message sent successfully."));
      form.reset();
    } catch (err) {
      show(el.error, t("contact_error", "Unable to send message."));
    } finally {
      if (el.submit) {
        el.submit.disabled = false;
        el.submit.textContent = t("contact_submit", "Submit");
      }
    }
  }

  bindClearOnInput();
  form.addEventListener("submit", handleSubmit);
})();
