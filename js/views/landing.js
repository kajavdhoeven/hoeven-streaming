/* ==========================================================================
   Voorpagina voor bezoekers die nog niet zijn ingelogd (route /)
   ========================================================================== */

import { h, Scope } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { api } from "../api/index.js";

const FEATURES = [
  { icon: "tv", title: "Kijk overal", text: "Op je telefoon, tablet, laptop of computer. Hoeven+ draait in je browser en is als app op je beginscherm te zetten." },
  { icon: "user", title: "Je eigen profiel", text: "Iedereen maakt een profiel met een eigen kleur en symbool. Je lijst en je voortgang blijven van jou." },
  { icon: "play", title: "Verder waar je bleef", text: "Stop midden in een aflevering en ga later op een ander apparaat precies op dezelfde plek verder." },
  { icon: "shield", title: "Veilig voor kinderen", text: "Kinderprofielen tonen alleen titels die bij hun leeftijd passen, volgens de Kijkwijzer." },
  { icon: "sparkles", title: "Gratis en zonder reclame", text: "Geen abonnement, geen advertenties en geen gedoe. Alleen onze eigen films en series." },
  { icon: "lock", title: "Alleen voor ons", text: "Nieuwe leden worden handmatig goedgekeurd. Zo kijkt er niemand mee die je niet kent." },
];

const STEPS = [
  { title: "Vraag een account aan", text: "Vul je naam, e-mailadres en een wachtwoord in. Dat kost een minuutje." },
  { title: "Wacht op goedkeuring", text: "De beheerder keurt je goed. Zo weten we zeker dat je erbij hoort." },
  { title: "Kies je profiel en kijk", text: "Maak een profiel met je eigen kleur en symbool, en begin met kijken." },
];

const FAQ = [
  ["Wat is Hoeven+?", "Hoeven+ is onze eigen streamingdienst. Hier staan de films, series en opnames van de familie: vakanties, optredens, feestjes en zelfgemaakte mini-series. Alles op één plek, in een ontwerp dat voelt als de streamingdiensten die je kent."],
  ["Wat kost het?", "Niets. Hoeven+ is gratis en toont geen reclame. Het is een hobbyproject voor familie en vrienden."],
  ["Wie mag er kijken?", "Alleen familie en vrienden. Je vraagt een account aan en de beheerder bepaalt wie erbij mag. Zo blijven onze beelden privé."],
  ["Hoe krijg ik toegang?", "Klik op Account aanvragen, vul je naam, e-mailadres en een wachtwoord in en wacht tot je bent goedgekeurd. Daarna log je in, kies je een profiel en kun je kijken."],
  ["Op welke apparaten kan ik kijken?", "Op bijna alles met een browser: telefoon, tablet, laptop en computer. Op je telefoon kun je Hoeven+ op je beginscherm zetten, zodat het voelt als een echte app."],
  ["Is Hoeven+ veilig voor kinderen?", "Ja. Je kunt kinderprofielen maken. Die tonen alleen titels met Kijkwijzer Alle leeftijden, 6+ en 9+."],
  ["Onthoudt Hoeven+ waar ik gebleven was?", "Ja. Per profiel bewaren we je voortgang, dus je gaat altijd verder waar je was, ook op een ander apparaat."],
];

const COLS = 9;
const ROWS = 6;

function mosaic(posters) {
  const n = posters.length;
  const cols = [];
  for (let c = 0; c < COLS; c++) {
    const tiles = [];
    for (let r = 0; r < ROWS; r++) {
      const i = c * ROWS + r;
      // Met genoeg posters alleen posters, anders afwisselen met kleurvlakken
      const poster = n >= 6 ? posters[(i * 5) % n] : n && i % 2 === 0 ? posters[(i / 2) % n | 0] : null;
      tiles.push(h("div", { class: `lp-tile t${(i * 3) % 10}` }, poster ? h("img", { src: api.media.artwork(poster.poster_path), alt: "", loading: "lazy", decoding: "async", draggable: false }) : null));
    }
    cols.push(h("div", { class: "lp-col", style: { "--c": c } }, tiles));
  }
  return cols;
}

function appPreview() {
  const tile = (i) => h("div", { class: `lp-mini t${i}` });
  return h("div", { class: "lp-mock", "aria-hidden": "true" },
    h("div", { class: "lp-mock-bar" }, h("i"), h("i"), h("i"), h("span", null, "Hoeven+")),
    h("div", { class: "lp-mock-hero" },
      h("div", { class: "lp-mock-text" },
        h("small", null, "UITGELICHT"), h("strong", null, "Zomer in Zeeland"), h("span", null, "Een week aan de kust: fietsen, mosselen en de mooiste zonsondergangen."),
        h("div", { class: "lp-mock-btns" }, h("b", null, "Afspelen"), h("em", null, "Meer info")))),
    h("div", { class: "lp-mock-row" }, h("small", null, "Verder kijken"), h("div", null, [1, 4, 7, 2, 5].map(tile))),
    h("div", { class: "lp-mock-row" }, h("small", null, "Nieuw op Hoeven+"), h("div", null, [3, 8, 0, 6, 9].map(tile))),
  );
}

export default {
  mount(root) {
    const scope = new Scope();
    const mosaicEl = h("div", { class: "lp-mosaic", "aria-hidden": "true" }, mosaic([]));
    const rankWrap = h("section", { class: "lp-section lp-rank-section", hidden: true });

    const header = h("header", { class: "lp-header" },
      h("a", { href: "#/", "aria-label": "Hoeven+" }, h("img", { src: "assets/img/logo.png", alt: "Hoeven+" })),
      h("div", { class: "lp-header-actions" },
        h("a", { class: "btn btn-ghost btn-sm", href: "#/login" }, "Inloggen"),
        h("a", { class: "btn btn-gradient btn-sm lp-hide-sm", href: "#/login?mode=register" }, "Account aanvragen")));

    const hero = h("section", { class: "lp-hero" },
      mosaicEl,
      h("div", { class: "lp-hero-inner" },
        h("span", { class: "lp-eyebrow" }, "Privé streamingdienst"),
        h("h1", null, "Onze verhalen. ", h("span", { class: "grad-text lp-shimmer" }, "Jouw scherm.")),
        h("p", { class: "lp-lead" }, "Films, series en herinneringen van de familie, op één plek. Gratis, zonder reclame en alleen voor familie en vrienden."),
        h("div", { class: "lp-cta" },
          h("a", { class: "btn btn-gradient btn-lg", href: "#/login?mode=register" }, "Account aanvragen", icon("chevron-right")),
          h("a", { class: "btn btn-ghost btn-lg", href: "#/login" }, "Inloggen")),
        h("ul", { class: "lp-pills" },
          ["Gratis", "Geen reclame", "Op al je apparaten"].map((t) => h("li", null, icon("check"), t)))),
      h("div", { class: "lp-arc" }));

    /* Redenen */
    const features = h("section", { class: "lp-section" },
      h("h2", { class: "lp-h2 reveal" }, "Meer redenen om erbij te horen"),
      h("div", { class: "lp-grid" },
        FEATURES.map((f, i) => h("article", { class: "lp-card reveal", style: { "--i": i % 3 } },
          h("div", null, h("h3", null, f.title), h("p", null, f.text)),
          h("div", { class: "lp-card-icon" }, icon(f.icon))))));

    /* Zo ziet het eruit */
    const preview = h("section", { class: "lp-section lp-preview" },
      h("div", { class: "lp-preview-text reveal" },
        h("h2", { class: "lp-h2" }, "Zoals je het kent, maar dan van ons"),
        h("p", { class: "lp-lead" }, "Een grote uitgelichte titel, rijen om doorheen te bladeren en je eigen Verder kijken. Alles is gemaakt voor onze eigen beelden."),
        h("ul", { class: "lp-checks" }, ["Series met seizoenen en afleveringen", "Binnenkort-titels met aftelling", "Zoeken op titel of genre"].map((t) => h("li", null, h("span", null, icon("check")), t)))),
      h("div", { class: "lp-preview-art reveal", style: { "--i": 1 } }, h("div", { class: "lp-glow" }), appPreview()));

    /* Zo werkt het */
    const steps = h("section", { class: "lp-section" },
      h("h2", { class: "lp-h2 reveal" }, "Zo werkt het"),
      h("ol", { class: "lp-steps" },
        STEPS.map((s, i) => h("li", { class: "lp-step reveal", style: { "--i": i } },
          h("span", { class: "lp-step-num" }, String(i + 1)), h("h3", null, s.title), h("p", null, s.text)))));

    /* Veelgestelde vragen */
    const items = FAQ.map(([q, a], i) => {
      const btn = h("button", { class: "lp-q", "aria-expanded": "false", "aria-controls": `faq-${i}`, id: `faq-q-${i}` }, h("span", null, q), icon("plus"));
      const panel = h("div", { class: "lp-a", id: `faq-${i}`, role: "region", "aria-labelledby": `faq-q-${i}` }, h("div", null, h("p", null, a)));
      const item = h("div", { class: "lp-faq-item reveal", style: { "--i": Math.min(i, 3) } }, btn, panel);
      btn.addEventListener("click", () => {
        const open = !item.classList.contains("is-open");
        item.classList.toggle("is-open", open);
        btn.setAttribute("aria-expanded", String(open));
      });
      return item;
    });
    const faq = h("section", { class: "lp-section lp-faq" }, h("h2", { class: "lp-h2 reveal" }, "Veelgestelde vragen"), h("div", null, items));

    /* Afsluiting */
    const final = h("section", { class: "lp-final reveal" },
      h("div", { class: "lp-final-glow" }),
      h("h2", null, "Klaar om te kijken?"),
      h("p", { class: "lp-lead" }, "Vraag je account aan. Zodra je bent goedgekeurd kun je beginnen."),
      h("div", { class: "lp-cta" },
        h("a", { class: "btn btn-gradient btn-lg", href: "#/login?mode=register" }, "Account aanvragen", icon("chevron-right")),
        h("a", { class: "btn btn-outline btn-lg", href: "#/login" }, "Ik heb al een account")));

    const footer = h("footer", { class: "lp-footer" },
      h("img", { src: "assets/img/logo.png", alt: "Hoeven+" }),
      h("p", null, "Een privé streamingdienst voor familie en vrienden. Niet openbaar toegankelijk."),
      h("p", { class: "faint" }, `© ${new Date().getFullYear()} Hoeven+`));

    root.appendChild(h("div", { class: "lp" }, header, hero, rankWrap, features, preview, steps, faq, final, footer));

    /* Kop wordt vast zodra je scrolt */
    const onScroll = () => header.classList.toggle("is-solid", window.scrollY > 40);
    scope.on(window, "scroll", onScroll, { passive: true });
    onScroll();

    /* Verschijnen bij scrollen */
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    root.querySelectorAll(".reveal").forEach((el) => io.observe(el));
    scope.add(() => io.disconnect());

    /* Muis-parallax op het raster (niet op touchscreens) */
    if (matchMedia("(hover: hover)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      let raf = 0;
      scope.on(hero, "mousemove", (e) => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const r = hero.getBoundingClientRect();
          mosaicEl.style.setProperty("--mx", ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
          mosaicEl.style.setProperty("--my", ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
        });
      });
      scope.add(() => cancelAnimationFrame(raf));
    }

    /* Titels voor het raster en de populair-rij (alleen wat jij openbaar hebt gemaakt) */
    let alive = true;
    scope.add(() => { alive = false; });
    api.landing.showcase().then((list) => {
      if (!alive || !list.length) return;
      mosaicEl.replaceChildren(...mosaic(list));
      const top = list.slice(0, 10);
      rankWrap.replaceChildren(
        h("h2", { class: "lp-h2 reveal" }, "Populair op Hoeven+"),
        h("div", { class: "lp-rank" }, top.map((t, i) =>
          h("a", { class: "lp-rank-item reveal", href: "#/login", style: { "--i": Math.min(i, 4) }, title: `${t.title}: log in om te kijken`, "aria-label": `${i + 1}. ${t.title}` },
            h("span", { class: "lp-rank-num", "aria-hidden": "true" }, String(i + 1)),
            h("span", { class: "lp-rank-poster" }, h("img", { src: api.media.artwork(t.poster_path), alt: t.title, loading: "lazy", decoding: "async" }))))));
      rankWrap.hidden = false;
      rankWrap.querySelectorAll(".reveal").forEach((el) => io.observe(el));
    }).catch(() => {});

    return () => scope.dispose();
  },
};
