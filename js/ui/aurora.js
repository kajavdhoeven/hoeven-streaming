import { h } from "./dom.js";

export const aurora = () => h("div", { class: "aurora", "aria-hidden": "true" }, h("i"), h("i"), h("i"));
