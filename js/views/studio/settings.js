/* Studio > Instellingen: mededeling voor kijkers, opslag, backend-status en uitleg over de Kijkwijzer. */

import { h, Scope } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { toast } from "../../ui/toast.js";
import { confirmDialog } from "../../ui/modal.js";
import { RATINGS, KIDS_RATINGS, ratingLabel } from "../../ui/format.js";
import { session, reloadSettings } from "../../core/session.js";
import { api } from "../../api/index.js";
import { CONFIG } from "../../config.js";
import { ratingBadge } from "./layout.js";

const RATING_TEXT = {
  AL: "Geschikt voor alle leeftijden.",
  6: "Niet geschikt voor kinderen onder 6 jaar.",
  9: "Niet geschikt voor kinderen onder 9 jaar.",
  12: "Niet geschikt voor kinderen onder 12 jaar.",
  14: "Niet geschikt voor kinderen onder 14 jaar.",
  16: "Niet geschikt voor kinderen onder 16 jaar.",
  18: "Alleen voor volwassenen.",
};

const MAX = 140;

export default {
  async mount(root) {
    const scope = new Scope();
    const page = h("div", { class: "st-page st-settings" });
    root.appendChild(page);

    const demo = api.mode === "demo";
    let cur = session.settings?.announcement || { enabled: false, text: "" };
    try { cur = (await api.settings.get()).announcement || cur; } catch { /* dan de sessiewaarde */ }
    let saved = { enabled: !!cur.enabled, text: cur.text || "" };
    const form = { ...saved };

    /* --- Mededeling --------------------------------------------------------------------------- */
    const onIn = h("input", { type: "checkbox", checked: form.enabled });
    const textIn = h("textarea", { class: "textarea", maxLength: MAX, style: { minHeight: "88px" }, placeholder: "Bijvoorbeeld: Nieuw! Skivakantie staat vanaf vrijdag online.", value: form.text });
    const counter = h("span", { class: "hint" });
    const pillText = h("span", null);
    const pill = h("div", { class: "st-pill" }, icon("megaphone"), pillText, h("span", { class: "st-pill-x", "aria-hidden": "true" }, icon("x")));
    const stage = h("div", { class: "st-pill-stage", "aria-label": "Voorvertoning van de mededeling" }, pill);
    const saveBtn = h("button", { class: "btn btn-gradient", type: "button", onClick: () => save() }, icon("check"), "Opslaan");

    const dirty = () => form.enabled !== saved.enabled || form.text.trim() !== saved.text;
    function sync() {
      counter.textContent = `${form.text.length} / ${MAX}`;
      pillText.textContent = form.text.trim() || "Hier komt je mededeling";
      pill.classList.toggle("is-off", !form.enabled);
      pill.classList.toggle("is-empty", !form.text.trim());
      stage.dataset.state = form.enabled ? "on" : "off";
      saveBtn.disabled = !dirty();
    }
    scope.on(onIn, "change", () => { form.enabled = onIn.checked; sync(); });
    scope.on(textIn, "input", () => { form.text = textIn.value; sync(); });

    async function save() {
      if (form.enabled && !form.text.trim()) { toast("Schrijf eerst een tekst voor de mededeling.", "error"); textIn.focus(); return; }
      saveBtn.classList.add("is-loading");
      try {
        const value = { enabled: form.enabled, text: form.text.trim() };
        await api.settings.set("announcement", value);
        await reloadSettings();
        saved = { ...value };
        toast(value.enabled ? "Mededeling staat live." : "Opgeslagen. De mededeling staat uit.", "ok");
      } catch (e) { toast(e.message, "error"); }
      saveBtn.classList.remove("is-loading");
      sync();
    }

    const announce = h("section", { class: "st-card st-set-card stagger", style: { "--i": 0 } },
      h("div", { class: "st-set-head" }, h("span", { class: "st-set-ico" }, icon("megaphone")), h("div", null, h("h3", null, "Mededeling voor kijkers"), h("p", { class: "muted" }, "Een korte boodschap die alle kijkers zien, bijvoorbeeld over nieuwe titels."))),
      h("label", { class: "switch" }, onIn, h("span", { class: "track" }), h("span", null, "Mededeling tonen")),
      h("div", { class: "field" }, h("label", { for: "st-ann" }, "Tekst"), Object.assign(textIn, { id: "st-ann" }), counter),
      h("div", { class: "field" }, h("span", { class: "label" }, "Zo zien kijkers het"), stage),
      h("div", { class: "st-set-foot" }, saveBtn));

    /* --- Opslag ---------------------------------------------------------------------------------- */
    const storage = h("section", { class: "st-card st-set-card stagger", style: { "--i": 1 } },
      h("div", { class: "st-set-head" }, h("span", { class: "st-set-ico" }, icon("upload")), h("div", null, h("h3", null, "Opslag en grote video's"), h("p", { class: "muted" }, "Waar je bestanden terechtkomen."))),
      h("ul", { class: "st-facts" },
        h("li", null, icon("image"), h("span", null, h("b", null, "Afbeeldingen"), " (posters, achtergronden en thumbnails) zijn maximaal 10 MB per stuk.")),
        h("li", null, icon("film"), h("span", null, h("b", null, "Geüploade video's"), " staan in Supabase. Het gratis plan heeft een limiet van 50 MB per bestand.")),
        h("li", null, icon("link"), h("span", null, h("b", null, "Tip:"), " voor grotere video's kies je bij een video 'Externe link'. Zet het bestand bijvoorbeeld op Cloudflare R2 of Cloudflare Stream en plak de link naar de .mp4 of .m3u8.")),
      ));

    /* --- Backend ----------------------------------------------------------------------------------- */
    const url = CONFIG.SUPABASE_URL;
    const backend = h("section", { class: "st-card st-set-card stagger", style: { "--i": 2 } },
      h("div", { class: "st-set-head" }, h("span", { class: "st-set-ico" }, icon("gauge")), h("div", null, h("h3", null, "Backend-status"), h("p", { class: "muted" }, "Waar de gegevens van Hoeven+ staan."))),
      h("div", { class: `st-status ${demo ? "is-demo" : "is-live"}` }, h("i"), h("b", null, demo ? "Demo-modus" : "Supabase verbonden")),
      demo
        ? h("p", { class: "muted" }, "Er zijn geen Supabase-gegevens ingevuld in js/config.js. Alles wat je nu doet blijft alleen in deze browser staan en is dus niet zichtbaar voor anderen.")
        : h("div", { class: "field" }, h("span", { class: "label" }, "SUPABASE_URL"), h("code", { class: "st-code" }, url)),
      demo ? h("div", { class: "st-set-foot" }, h("button", { class: "btn btn-danger", type: "button", onClick: async () => {
        if (!await confirmDialog({ title: "Demo-gegevens resetten?", message: "Alle titels, rijen en leden die je in de demo hebt gemaakt worden gewist en de voorbeeldgegevens komen terug.", confirmText: "Resetten", danger: true })) return;
        try { localStorage.removeItem("hp:demo:v1"); } catch { /* */ }
        location.reload();
      } }, icon("refresh"), "Demo-gegevens resetten")) : null);

    /* --- Kijkwijzer ------------------------------------------------------------------------------------- */
    const ratings = h("section", { class: "st-card st-set-card st-wide stagger", style: { "--i": 3 } },
      h("div", { class: "st-set-head" }, h("span", { class: "st-set-ico" }, icon("shield")), h("div", null, h("h3", null, "Kijkwijzer"), h("p", { class: "muted" }, "Elke titel heeft een leeftijdsaanduiding. Kinderprofielen zien alleen AL, 6 en 9."))),
      h("ul", { class: "st-rate-list" }, RATINGS.map((r) => {
        const kids = KIDS_RATINGS.includes(r);
        return h("li", { class: "st-rate-row" }, ratingBadge(r), h("div", null, h("b", null, ratingLabel(r)), h("small", null, RATING_TEXT[r])),
          h("span", { class: `badge ${kids ? "ok" : "draft"}` }, kids ? "Ook voor kinderprofielen" : "Alleen gewone profielen"));
      })));

    page.append(announce, storage, backend, ratings);
    sync();
    return () => scope.dispose();
  },
};
