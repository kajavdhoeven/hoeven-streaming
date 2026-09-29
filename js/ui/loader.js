import { h } from "./dom.js";

/** Logo dat zich met kleur vult. */
export function loader({ bar = true } = {}) {
  return h("div", { class: "loader", role: "status", "aria-label": "Laden" },
    h("div", { class: "logo-mask" }),
    bar ? h("div", { class: "loader-bar" }) : null,
  );
}
