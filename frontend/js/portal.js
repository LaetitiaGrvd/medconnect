(function () {
  const api = window.MC_API;
  const ui = window.MC_UI;
  const t = window.MC_I18N?.t || ((_, fallback) => fallback);

  function $(id) {
    return document.getElementById(id);
  }

  function isSafeRelativePath(p) {
    if (!p) return false;
    if (p.includes("://") || p.startsWith("//")) return false;
    if (p.startsWith("javascript:")) return false;
    if (!/^[a-z0-9_\-./?=&%#]+$/i.test(p)) return false;
    return true;
  }

  function getRedirectTarget() {
    const params = new URLSearchParams(window.location.search);

    const returnTo = params.get("returnTo");
    if (isSafeRelativePath(returnTo)) return decodeURIComponent(returnTo);

    const redirect = params.get("redirect");
    if (isSafeRelativePath(redirect)) return redirect;

    return "dashboard.html";
  }

  async function getMe() {
    if (!api?.hasBase?.()) return null;
    const { ok, data } = await api.getJson("/api/me");
    if (!ok) return null;
    if (!data || data.success !== true || !data.data?.user) return null;
    return data.data.user;
  }

  async function postJSON(path, payload) {
    if (!api?.hasBase?.()) {
      return {
        ok: false,
        status: 0,
        data: { error: { message: t("api_missing", "Service is temporarily unavailable.") } },
      };
    }
    return api.postJson(path, payload);
  }

  function showError(msg) {
    if (ui?.toast) {
      ui.toast(msg, "error");
    } else {
      alert(msg);
    }
  }

  function openForgotModal() {
    const modal = document.getElementById("forgotModal");
    const errorBox = document.getElementById("forgotError");
    if (!modal) return;
    if (errorBox) errorBox.hidden = true;
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function closeForgotModal() {
    const modal = document.getElementById("forgotModal");
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const existingUser = await getMe();
    if (existingUser) {
      window.location.href = getRedirectTarget();
      return;
    }

    const loginForm = $("loginForm");
    const registerForm = $("registerForm");
    const forgotBtn = $("forgotBtn");
    const forgotSubmit = $("forgotSubmit");

    if (loginForm) {
      loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const email = ($("loginEmail")?.value || "").trim();
        const password = ($("loginPassword")?.value || "").trim();

        const { ok, data } = await postJSON("/api/auth/login", { email, password });

        if (!ok || !data.success) {
          showError(data.error?.message || data.error || t("portal_login_failed", "Login failed"));
          return;
        }

        window.location.href = getRedirectTarget();
      });
    }

    if (registerForm) {
      registerForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const name = ($("regName")?.value || "").trim();
        const email = ($("regEmail")?.value || "").trim();
        const phone = ($("regPhone")?.value || "").trim();
        const password = ($("regPassword")?.value || "").trim();

        const { ok, data } = await postJSON("/api/auth/register", {
          name,
          email,
          phone,
          password,
        });

        if (!ok || !data.success) {
          showError(data.error?.message || data.error || t("portal_register_failed", "Registration failed"));
          return;
        }

        window.location.href = getRedirectTarget();
      });
    }

    if (forgotBtn) {
      forgotBtn.addEventListener("click", (e) => {
        e.preventDefault();
        openForgotModal();
      });
    }

    if (forgotSubmit) {
      forgotSubmit.addEventListener("click", async () => {
        const email = ($("forgotEmail")?.value || "").trim();
        const phone = ($("forgotPhone")?.value || "").trim();
        const errorBox = $("forgotError");

        if (errorBox) errorBox.hidden = true;
        if (!email) {
          if (errorBox) {
            errorBox.textContent = t("portal_forgot_email_required", "Email is required.");
            errorBox.hidden = false;
          }
          return;
        }

        forgotSubmit.disabled = true;
        forgotSubmit.textContent = t("portal_forgot_sending", "Sending...");

        const { ok, data } = await postJSON("/api/auth/forgot-password", {
          email,
          phone: phone || null,
        });

        forgotSubmit.disabled = false;
        forgotSubmit.textContent = t("portal_forgot_submit", "Submit");

        if (!ok || !data.success) {
          const msg = data?.error?.message || t("portal_forgot_error", "Unable to submit request.");
          if (errorBox) {
            errorBox.textContent = msg;
            errorBox.hidden = false;
          }
          return;
        }

        closeForgotModal();
        if (ui?.toast) {
          ui.toast(t("portal_forgot_success", "Your request has been received. We will contact you soon."), "success");
        } else {
          alert(t("portal_forgot_success", "Your request has been received. We will contact you soon."));
        }
      });
    }

    document.addEventListener("click", (e) => {
      const t = e.target;
      if (!t) return;
      if (t.matches('[data-close="true"]')) {
        closeForgotModal();
      }
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeForgotModal();
    });
  });
})();
