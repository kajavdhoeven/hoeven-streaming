/* Intro-animatie: het logo onthult zich, krijgt een lichtstreep en zoomt weg. */

import { h } from "../ui/dom.js";

export function playSplash({ short = false } = {}) {
  const el = h("div", { class: `splash${short ? " is-short" : ""}`, "aria-hidden": "true" },
    h("div", { class: "splash-glow g1" }),
    h("div", { class: "splash-glow g2" }),
    h("div", { class: "splash-glow g3" }),
    h("div", { class: "splash-stage" },
      h("div", { class: "splash-logo" },
        h("img", { src: "assets/img/logo.png", alt: "", draggable: false }),
        h("div", { class: "splash-shine" }),
      ),
      h("div", { class: "splash-line" }),
      h("div", { class: "splash-tagline" }, "Onze eigen streamingdienst"),
    ),
  );
  document.body.appendChild(el);

  const minTime = short ? 900 : 2900;
  const started = performance.now();
  let skipped = false;
  const skip = () => { skipped = true; };
  el.addEventListener("pointerdown", skip);
  window.addEventListener("keydown", skip, { once: true });

  return {
    /** Wacht tot minimale tijd voorbij is (of de gebruiker overslaat), speel dan de uitfade. */
    async finish() {
      while (!skipped && performance.now() - started < minTime) await new Promise((r) => setTimeout(r, 40));
      el.classList.add("is-leaving");
      await new Promise((r) => setTimeout(r, short || skipped ? 350 : 650));
      window.removeEventListener("keydown", skip);
      el.remove();
    },
  };
}
