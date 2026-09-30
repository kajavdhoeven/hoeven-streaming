/* "Wie kijkt er?" - profielen kiezen, aanmaken en beheren. */

import { h, Scope, sleep } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { aurora } from "../ui/aurora.js";
import { avatar, AVATAR_COLORS, AVATAR_EMOJIS } from "../ui/avatar.js";
import { openModal, confirmDialog } from "../ui/modal.js";
import { toast } from "../ui/toast.js";
import { profileTransition } from "../ui/transition.js";
import { api } from "../api/index.js";
import { navigate } from "../core/router.js";
import { session, isAdmin, activateProfile, reloadProfiles, signOut } from "../core/session.js";

const MAX = 5;

export default {
  mount(root, ctx) {
    const scope = new Scope();
    const manage = ctx.route.name === "profiles-manage";
    let picking = false;

    const grid = h("div", { class: "pf-grid" });
    const title = h("h1", { class: "pf-title" });
    const sub = h("p", { class: "pf-sub" });
    const actions = h("div", { class: "pf-actions" });

    root.appendChild(h("section", { class: "pf" }, aurora(),
      h("div", { class: "pf-top" },
        h("img", { class: "pf-logo", src: "assets/img/logo.png", alt: "Hoeven+" }),
        h("button", { class: "btn btn-ghost btn-sm", onClick: async () => { await signOut(); navigate("/"); } }, icon("log-out"), "Uitloggen")),
      title, sub, grid, actions));

    async function pick(profile, tile) {
      if (picking) return;
      picking = true;
      grid.classList.add("is-picking");
      tile.classList.add("is-picked");
      actions.classList.add("is-hidden");
      await sleep(650);
      const t = profileTransition(profile);
      await t.covered;
      try { await activateProfile(profile); } catch (e) { toast(e.message, "error"); }
      navigate("/browse");
      await t.finish();
    }

    function tile(p, i) {
      const el = h("button", { class: `pf-tile${manage ? " is-edit" : ""}`, style: { "--i": i }, "aria-label": manage ? `${p.name} bewerken` : `Kijken als ${p.name}`, onClick: () => (manage ? editor(p) : pick(p, el)) },
        h("div", { style: { position: "relative" } },
          avatar(p),
          manage ? h("div", { class: "pf-edit-ov", style: { borderRadius: "20%" } }, icon("pencil")) : null,
          p.is_kids ? h("span", { class: "badge pf-kids" }, "Kids") : null),
        h("span", { class: "pf-name" }, p.name));
      return el;
    }

    function render() {
      const list = session.profiles;
      title.textContent = manage ? "Profielen beheren" : list.length ? "Wie kijkt er?" : "Wie ben jij?";
      sub.textContent = manage ? "Kies een profiel om aan te passen." : list.length ? "" : "Maak je eerste profiel om te beginnen.";
      sub.hidden = !sub.textContent;
      grid.replaceChildren(
        ...list.map((p, i) => tile(p, i)),
        list.length < MAX
          ? h("button", { class: "pf-tile pf-add", style: { "--i": list.length }, "aria-label": "Profiel toevoegen", onClick: () => editor(null) },
            h("div", { class: "avatar" }, icon("plus")), h("span", { class: "pf-name" }, "Profiel toevoegen"))
          : null,
      );
      actions.replaceChildren(
        manage
          ? h("button", { class: "btn btn-primary btn-lg", onClick: () => navigate("/profiles") }, "Klaar")
          : list.length ? h("button", { class: "btn btn-outline btn-lg", onClick: () => navigate("/profiles/manage") }, icon("pencil"), "Profielen beheren") : null,
        isAdmin() && !manage ? h("button", { class: "btn btn-ghost btn-lg", onClick: () => navigate("/studio") }, icon("sliders"), "Hoeven+ Studio") : null,
      );
    }

    function editor(existing) {
      const draft = existing ? { ...existing } : { name: "", avatar_color: AVATAR_COLORS[session.profiles.length % AVATAR_COLORS.length], avatar_emoji: AVATAR_EMOJIS[session.profiles.length % AVATAR_EMOJIS.length], is_kids: false };
      const preview = h("div", { class: "pe-preview" });
      const paint = () => preview.replaceChildren(h("div", { class: `avatar ${draft.avatar_color}`, style: { "--size": "116px" } }, h("span", { key: draft.avatar_emoji }, draft.avatar_emoji)));
      const name = h("input", { class: "input", maxLength: 20, placeholder: "Naam", value: draft.name, autofocus: true, "aria-label": "Naam", onInput: (e) => { draft.name = e.target.value; } });
      const swatches = h("div", { class: "pe-swatches" }, AVATAR_COLORS.map((c) => h("button", { type: "button", class: `pe-swatch avatar ${c}`, "aria-label": `Kleur ${c}`, style: { "--size": "38px" }, onClick: () => { draft.avatar_color = c; paintPickers(); paint(); } })));
      const emojis = h("div", { class: "pe-emojis" }, AVATAR_EMOJIS.map((e) => h("button", { type: "button", class: "pe-emoji", "aria-label": `Symbool ${e}`, onClick: () => { draft.avatar_emoji = e; paintPickers(); paint(); } }, e)));
      const paintPickers = () => {
        [...swatches.children].forEach((b, i) => b.classList.toggle("is-active", AVATAR_COLORS[i] === draft.avatar_color));
        [...emojis.children].forEach((b, i) => b.classList.toggle("is-active", AVATAR_EMOJIS[i] === draft.avatar_emoji));
      };
      const kids = h("input", { type: "checkbox", checked: draft.is_kids, onChange: (e) => { draft.is_kids = e.target.checked; } });

      const save = h("button", { class: "btn btn-gradient", onClick: async () => {
        const n = draft.name.trim();
        if (!n) { name.classList.add("is-error"); name.focus(); setTimeout(() => name.classList.remove("is-error"), 500); return; }
        save.classList.add("is-loading");
        try {
          const values = { name: n, avatar_color: draft.avatar_color, avatar_emoji: draft.avatar_emoji, is_kids: draft.is_kids };
          if (existing) await api.profiles.update(existing.id, values);
          else await api.profiles.create(values, session.member.id);
          await reloadProfiles();
          modal.close();
          render();
          toast(existing ? "Profiel opgeslagen." : "Profiel gemaakt.", "ok");
        } catch (e) { toast(e.message, "error"); save.classList.remove("is-loading"); }
      } }, existing ? "Opslaan" : "Profiel maken");

      const del = existing && session.profiles.length > 1
        ? h("button", { class: "btn btn-danger", style: { marginRight: "auto" }, onClick: async () => {
          if (!(await confirmDialog({ title: `${existing.name} verwijderen?`, message: "Kijkgeschiedenis en Mijn lijst van dit profiel gaan verloren.", confirmText: "Verwijderen", danger: true }))) return;
          try { await api.profiles.remove(existing.id); await reloadProfiles(); modal.close(); render(); toast("Profiel verwijderd.", "ok"); } catch (e) { toast(e.message, "error"); }
        } }, icon("trash"), "Verwijderen") : null;

      const modal = openModal({
        title: existing ? "Profiel bewerken" : "Nieuw profiel",
        body: [
          preview,
          h("div", { class: "field" }, h("label", null, "Naam"), name),
          h("div", { class: "field" }, h("label", null, "Kleur"), swatches),
          h("div", { class: "field" }, h("label", null, "Symbool"), emojis),
          h("label", { class: "pe-switch-row switch" },
            h("span", null, "Kinderprofiel", h("small", null, "Toont alleen titels met Kijkwijzer Alle leeftijden, 6+ en 9+.")),
            kids, h("span", { class: "track" })),
        ],
        footer: [del, h("button", { class: "btn btn-outline", onClick: () => modal.close() }, "Annuleren"), save],
      });
      paint(); paintPickers();
      name.addEventListener("keydown", (e) => { if (e.key === "Enter") save.click(); });
    }

    render();
    if (!session.profiles.length && !manage) setTimeout(() => editor(null), 700);
    return () => scope.dispose();
  },
};
