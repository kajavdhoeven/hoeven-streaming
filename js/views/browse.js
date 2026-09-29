/* Startpagina: hero-carrousel met uitgelichte titels + rijen. */

import { h, Scope } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { fmtDuration, countdown, ratingLabel } from "../ui/format.js";
import { continueCard, posterCard, row } from "../ui/cards.js";
import { toast } from "../ui/toast.js";
import { cat, visibleTitles, isAvailable, isUpcoming, upcomingTitles, getTitle, episodesOf, backdropUrl } from "../data/catalog.js";
import { ud, continueWatching, resumeTarget, removeFromContinue } from "../data/userdata.js";
import { session, isAdmin } from "../core/session.js";
import { navigate } from "../core/router.js";

const HERO_MS = 9000;

export function metaLine(t) {
  const eps = episodesOf(t.id);
  const bits = [];
  bits.push(h("span", null, t.kind === "series" ? "Serie" : "Film"));
  if (t.year) bits.push(h("span", null, String(t.year)));
  bits.push(h("span", { class: `rating-badge r-${t.rating}`, title: ratingLabel(t.rating) }, t.rating));
  if (t.kind === "series" && eps.length) bits.push(h("span", null, `${eps.length} ${eps.length === 1 ? "aflevering" : "afleveringen"}`));
  else if (eps[0]?.duration_seconds) bits.push(h("span", null, fmtDuration(eps[0].duration_seconds)));
  const out = [];
  bits.forEach((b, i) => { if (i) out.push(h("span", { class: "dot" })); out.push(b); });
  return out;
}

function heroSlide(t) {
  const up = isUpcoming(t);
  const target = up ? null : resumeTarget(t.id);
  let k = 0;
  const step = () => ({ "--k": k++ });
  return h("article", { class: "hero-slide", "aria-label": t.title },
    h("div", { class: "hero-bg" }, h("img", { src: backdropUrl(t), alt: "", decoding: "async" })),
    h("div", { class: "hero-content" },
      h("div", { class: "hero-kicker", style: step() }, up ? "Binnenkort" : "Uitgelicht"),
      h("h1", { class: "hero-title", style: step() }, t.title),
      h("div", { class: "hero-meta", style: step() }, metaLine(t), (t.genres || []).slice(0, 2).map((g) => [h("span", { class: "dot" }), h("span", null, g)])),
      t.description || t.tagline ? h("p", { class: "hero-desc clamp-3", style: step() }, t.tagline && !t.description ? t.tagline : t.description) : null,
      h("div", { class: "hero-actions", style: step() },
        up
          ? h("span", { class: "btn btn-ghost btn-lg", style: { pointerEvents: "none" } }, icon("lock"), t.release_at ? `Over ${countdown(t.release_at)}` : "Binnenkort")
          : h("button", { class: "btn btn-primary btn-lg", onClick: () => navigate(`/watch/${target.video.id}`) }, icon("play", { fill: true }), target.label),
        h("button", { class: "btn btn-ghost btn-lg", onClick: () => navigate(`/title/${t.id}`) }, icon("info"), "Meer info"),
      ),
    ),
  );
}

function buildHero(list, scope) {
  const slides = list.map(heroSlide);
  const dots = list.map((t, i) => h("button", { class: "hero-dot", "aria-label": `Toon ${t.title}`, onClick: () => show(i, true) }, h("i")));
  const hero = h("div", { class: "hero", role: "region", "aria-roledescription": "carrousel", "aria-label": "Uitgelicht" },
    slides,
    list.length > 1 ? [
      h("div", { class: "hero-dots" }, dots),
      h("button", { class: "hero-arrow left", "aria-label": "Vorige", onClick: () => show(idx - 1, true) }, icon("chevron-left")),
      h("button", { class: "hero-arrow right", "aria-label": "Volgende", onClick: () => show(idx + 1, true) }, icon("chevron-right")),
    ] : null);
  let idx = -1;
  let timer = null;

  function schedule() {
    clearTimeout(timer);
    if (list.length < 2 || hero.classList.contains("is-paused") || document.hidden) return;
    timer = setTimeout(() => show(idx + 1), HERO_MS);
  }
  function show(i, manual = false) {
    const next = (i + list.length) % list.length;
    if (next === idx && !manual) return;
    idx = next;
    slides.forEach((s, n) => s.classList.toggle("is-active", n === idx));
    dots.forEach((d, n) => {
      d.classList.toggle("is-done", n < idx);
      d.classList.remove("is-active");
      void d.offsetWidth; // animatie opnieuw starten
      d.classList.toggle("is-active", n === idx);
      d.style.setProperty("--dur", `${HERO_MS}ms`);
    });
    schedule();
  }
  scope.on(hero, "mouseenter", () => { hero.classList.add("is-paused"); clearTimeout(timer); });
  scope.on(hero, "mouseleave", () => { hero.classList.remove("is-paused"); show(idx, true); });
  scope.on(document, "visibilitychange", () => (document.hidden ? clearTimeout(timer) : show(idx, true)));
  // Vegen op touchscreens
  let x0 = null;
  scope.on(hero, "touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  scope.on(hero, "touchend", (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1), true); x0 = null; }, { passive: true });
  scope.add(() => clearTimeout(timer));
  show(0, true);
  return hero;
}

export default {
  mount(root) {
    const scope = new Scope();
    const profile = session.profile;
    const all = visibleTitles(profile);
    const shown = new Set(all.map((t) => t.id));

    if (!all.length) {
      root.appendChild(h("div", { class: "empty home-empty" },
        h("div", { class: "empty-icon" }, "🎬"),
        h("h3", null, "Er staat nog niets op Hoeven+"),
        h("p", null, isAdmin() ? "Voeg je eerste film of serie toe in de Studio." : "Kom snel terug, er komt binnenkort iets moois."),
        isAdmin() ? h("button", { class: "btn btn-gradient btn-lg", onClick: () => navigate("/studio/content/new") }, icon("plus"), "Eerste titel toevoegen") : null));
      return () => scope.dispose();
    }

    /* Hero: uitgelicht, anders de nieuwste titel */
    let featured = all.filter((t) => t.featured).slice(0, 5);
    if (!featured.length) featured = all.filter(isAvailable).slice(0, 1);
    if (!featured.length) featured = all.slice(0, 1);
    const heroWrap = h("div", null, buildHero(featured, scope));
    const rowsEl = h("div", { class: "rows" });
    root.append(heroWrap, rowsEl);

    function renderRows() {
      const out = [];
      const used = new Set();
      const cw = continueWatching(profile);
      if (cw.length) {
        out.push(row("Verder kijken", cw.map((c, i) => continueCard(c, { index: i, onRemove: async () => { await removeFromContinue(c.title.id); toast("Verwijderd uit Verder kijken.", "info"); renderRows(); } })), { wide: true }));
      }
      const mine = ud.list.map(getTitle).filter((t) => t && shown.has(t.id));
      if (mine.length) out.push(row("Mijn lijst", mine.map((t, i) => posterCard(t, { index: i }))));

      const userRows = cat.rows.filter((r) => r.visible).sort((a, b) => a.position - b.position);
      for (const r of userRows) {
        const ts = r.items.map(getTitle).filter((t) => t && shown.has(t.id));
        ts.forEach((t) => used.add(t.id));
        if (ts.length) out.push(row(r.name, ts.map((t, i) => posterCard(t, { index: i }))));
      }

      const avail = all.filter(isAvailable);
      if (!userRows.length) {
        if (avail.length) out.push(row("Nieuw op Hoeven+", avail.slice(0, 14).map((t, i) => posterCard(t, { index: i }))));
        const genres = new Map();
        avail.forEach((t) => (t.genres || []).forEach((g) => genres.set(g, [...(genres.get(g) || []), t])));
        for (const [g, ts] of [...genres].filter(([, ts]) => ts.length >= 2).sort((a, b) => b[1].length - a[1].length).slice(0, 4)) {
          out.push(row(g, ts.map((t, i) => posterCard(t, { index: i }))));
        }
      } else {
        const rest = avail.filter((t) => !used.has(t.id));
        if (rest.length) out.push(row("Meer om te ontdekken", rest.map((t, i) => posterCard(t, { index: i }))));
      }

      const up = upcomingTitles(profile);
      if (up.length) out.push(row("Binnenkort op Hoeven+", up.map((t, i) => posterCard(t, { index: i }))));
      rowsEl.replaceChildren(...out);
    }
    renderRows();

    return () => scope.dispose();
  },
};
