/* Account is aangemaakt maar nog niet goedgekeurd door de beheerder. */

import { h, Scope } from "../ui/dom.js";
import { aurora } from "../ui/aurora.js";
import { toast } from "../ui/toast.js";
import { navigate } from "../core/router.js";
import { refreshMember, session, signOut } from "../core/session.js";

export default {
  mount(root) {
    const scope = new Scope();
    const btn = h("button", { class: "btn btn-gradient", onClick: () => check(true) }, "Opnieuw controleren");

    async function check(manual) {
      btn.classList.add("is-loading");
      try {
        const m = await refreshMember();
        if (m?.approved) {
          toast("Je bent goedgekeurd. Welkom bij Hoeven+!", "ok");
          navigate("/profiles");
          return;
        }
        if (manual) toast("Nog niet goedgekeurd. Even geduld.", "info");
      } catch (e) { if (manual) toast(e.message, "error"); }
      btn.classList.remove("is-loading");
    }

    root.appendChild(h("section", { class: "auth" }, aurora(),
      h("div", { class: "auth-wrap" },
        h("img", { class: "auth-logo", src: "assets/img/logo.png", alt: "Hoeven+" }),
        h("div", { class: "auth-card auth-center" },
          h("div", { class: "pending-icon" }, h("span", null, "⏳")),
          h("div", { class: "auth-head" },
            h("h1", null, "Bijna klaar!"),
            h("p", null, `Je account (${session.member?.email}) is aangemaakt. Zodra de beheerder je heeft goedgekeurd kun je kijken.`)),
          btn,
          h("button", { class: "auth-link", onClick: async () => { await signOut(); navigate("/login"); } }, "Uitloggen"),
        ),
      ),
    ));

    scope.interval(() => check(false), 15000);
    return () => scope.dispose();
  },
};
