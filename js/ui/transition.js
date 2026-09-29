/* Schermovergang bij het kiezen/wisselen van profiel. */

import { h } from "./dom.js";
import { avatar } from "./avatar.js";

/**
 * const t = profileTransition(profile);
 * await t.covered;   // scherm is bedekt: nu mag je eronder navigeren
 * await t.finish();  // panel schuift weg
 */
export function profileTransition(profile, { text = "Welkom terug" } = {}) {
  const panel = h("div", { class: "pt", "aria-hidden": "true" },
    h("div", { class: "pt-bg" }),
    h("div", { class: "pt-inner" },
      h("div", { class: "pt-avatar" }, avatar(profile, { size: 132 })),
      h("div", { class: "pt-text" }, text),
      h("div", { class: "pt-name" }, profile.name),
    ),
  );
  document.body.appendChild(panel);
  document.body.classList.add("no-scroll");

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const covered = wait(1050);
  return {
    covered,
    async finish() {
      await wait(350);
      panel.classList.add("is-leaving");
      await wait(750);
      panel.remove();
      document.body.classList.remove("no-scroll");
    },
  };
}
