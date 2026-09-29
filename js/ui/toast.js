import { h } from "./dom.js";
import { icon } from "./icons.js";

/** toast("Opgeslagen", "ok") - type: ok | error | info */
export function toast(message, type = "info", ms = 3600) {
  const root = document.getElementById("toast-root");
  if (!root) return;
  const name = type === "ok" ? "check-circle" : type === "error" ? "alert" : "info";
  const el = h("div", { class: `toast ${type}`, role: type === "error" ? "alert" : "status" }, icon(name), h("span", null, message));
  root.appendChild(el);
  const remove = () => {
    el.classList.add("is-leaving");
    setTimeout(() => el.remove(), 380);
  };
  const t = setTimeout(remove, ms);
  el.addEventListener("click", () => { clearTimeout(t); remove(); });
  while (root.children.length > 3) root.firstChild.remove();
}
