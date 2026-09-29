import { h } from "./dom.js";
import { icon } from "./icons.js";

let openCount = 0;

/**
 * openModal({ title, body, footer, wide, onClose, dismissible })
 * body / footer: Node of array van Nodes. Geeft { el, close } terug.
 */
export function openModal({ title, body, footer, wide = false, onClose, dismissible = true } = {}) {
  const root = document.getElementById("overlay-root");
  const prevFocus = document.activeElement;
  let closed = false;

  const modal = h("div", { class: `modal${wide ? " is-wide" : ""}`, role: "dialog", "aria-modal": "true", "aria-label": title || "Venster" },
    title ? h("div", { class: "modal-head" }, h("h3", null, title),
      dismissible ? h("button", { class: "icon-btn", "aria-label": "Sluiten", style: { width: "38px", height: "38px", boxShadow: "none", background: "rgba(255,255,255,.07)" }, onClick: () => close() }, icon("x")) : null) : null,
    h("div", { class: "modal-body" }, body),
    footer ? h("div", { class: "modal-foot" }, footer) : null,
  );
  const backdrop = h("div", { class: "modal-backdrop", onMousedown: (e) => { if (e.target === backdrop && dismissible) close(); } }, modal);
  root.appendChild(backdrop);
  document.body.classList.add("no-scroll");
  openCount++;

  const onKey = (e) => { if (e.key === "Escape" && dismissible) { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", onKey, true);
  requestAnimationFrame(() => (modal.querySelector("[autofocus], input, textarea, select, button.btn-primary, button.btn-gradient") || modal).focus?.());

  function close(result) {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey, true);
    backdrop.classList.add("is-closing");
    setTimeout(() => {
      backdrop.remove();
      if (--openCount <= 0) { openCount = 0; document.body.classList.remove("no-scroll"); }
      prevFocus?.focus?.();
      onClose?.(result);
    }, 220);
  }
  return { el: modal, close };
}

/** Bevestigingsvenster; geeft een Promise<boolean>. */
export function confirmDialog({ title = "Weet je het zeker?", message = "", confirmText = "Bevestigen", cancelText = "Annuleren", danger = false } = {}) {
  return new Promise((resolve) => {
    let answer = false;
    const m = openModal({
      title,
      body: h("p", { class: "muted" }, message),
      footer: [
        h("button", { class: "btn btn-outline", onClick: () => m.close() }, cancelText),
        h("button", { class: `btn ${danger ? "btn-danger" : "btn-primary"}`, onClick: () => { answer = true; m.close(); } }, confirmText),
      ],
      onClose: () => resolve(answer),
    });
  });
}
