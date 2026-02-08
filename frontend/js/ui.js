(() => {
  const STYLE_ID = "mc-toast-style";

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .mc-toast {
        position: fixed;
        left: 50%;
        bottom: 24px;
        transform: translateX(-50%);
        padding: 12px 16px;
        border-radius: 12px;
        background: #111827;
        color: #fff;
        box-shadow: 0 12px 30px rgba(0,0,0,0.18);
        font-size: 14px;
        line-height: 1.4;
        z-index: 9999;
        max-width: calc(100% - 32px);
        text-align: center;
      }
      .mc-toast--error { background: #b91c1c; }
      .mc-toast--success { background: #0f766e; }
    `;
    document.head.appendChild(style);
  }

  function toast(message, type = "info", opts = {}) {
    if (!message) return;
    ensureStyles();

    const el = document.createElement("div");
    el.className = `mc-toast mc-toast--${type}`;
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.textContent = String(message);

    document.body.appendChild(el);

    const duration = Number.isFinite(opts.duration) ? opts.duration : 2600;
    window.setTimeout(() => {
      el.remove();
    }, duration);
  }

  window.MC_UI = { toast };
})();
