/* Titelvenster: opent over de huidige pagina heen (route /title/:id). */

import { h, Scope } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { toast } from "../ui/toast.js";
import { fmtDuration, fmtClock, fmtDate, countdown, ratingLabel } from "../ui/format.js";
import { posterCard } from "../ui/cards.js";
import { getTitle, episodesOf, seasonsOf, visibleTitles, isAvailable, isUpcoming, backdropUrl, thumbUrl } from "../data/catalog.js";
import { resumeTarget, progressOf, fraction, inMyList, toggleMyList } from "../data/userdata.js";
import { session } from "../core/session.js";
import { back, navigate } from "../core/router.js";
import { metaLine } from "./browse.js";

export default {
  mount(layer, ctx) {
    const scope = new Scope();
    const t = getTitle(ctx.params.id);
    const allowed = t && visibleTitles(session.profile).some((x) => x.id === t.id);
    document.body.classList.add("no-scroll");
    scope.add(() => document.body.classList.remove("no-scroll"));

    const close = () => back("/browse");
    const backdrop = h("div", { class: "tm-backdrop", onMousedown: (e) => { if (e.target === backdrop) close(); } });
    layer.appendChild(backdrop);
    scope.on(document, "keydown", (e) => { if (e.key === "Escape") close(); });

    if (!allowed) {
      backdrop.appendChild(h("div", { class: "tm", style: { padding: "40px", textAlign: "center", alignSelf: "center" } },
        h("div", { class: "empty" }, h("div", { class: "empty-icon" }, "🔍"), h("h3", null, "Titel niet gevonden"), h("p", null, "Deze titel bestaat niet meer of is niet beschikbaar voor dit profiel."),
          h("button", { class: "btn btn-primary", onClick: close }, "Sluiten"))));
      return () => scope.dispose();
    }

    const up = isUpcoming(t);
    const eps = episodesOf(t.id);
    const target = up ? null : resumeTarget(t.id);

    /* --- Acties -------------------------------------------------------------------- */
    const listBtn = h("button", { class: "icon-btn tm-list", "aria-label": "Mijn lijst" });
    const paintList = () => {
      const on = inMyList(t.id);
      listBtn.classList.toggle("is-on", on);
      listBtn.title = on ? "Verwijderen uit Mijn lijst" : "Toevoegen aan Mijn lijst";
      listBtn.setAttribute("aria-pressed", String(on));
      listBtn.replaceChildren(icon(on ? "check" : "plus"));
    };
    listBtn.addEventListener("click", async () => {
      try { const on = await toggleMyList(t.id); paintList(); toast(on ? "Toegevoegd aan Mijn lijst." : "Verwijderd uit Mijn lijst.", "ok"); } catch (e) { toast(e.message, "error"); }
    });
    paintList();

    const playRow = up
      ? h("div", { class: "tm-locked" }, h("div", { class: "tm-locked-icon" }, icon("lock")),
        h("div", null, h("strong", null, t.release_at ? `Verschijnt over ${countdown(t.release_at)}` : "Binnenkort beschikbaar"), h("span", null, t.release_at ? fmtDate(t.release_at) : "Er is nog geen datum bekend.")), listBtn)
      : h("div", { class: "tm-actions" },
        h("button", { class: "btn btn-primary btn-lg", onClick: () => navigate(`/watch/${target.video.id}`) }, icon("play", { fill: true }), target.label),
        listBtn,
        target.kind === "resume" ? h("div", { class: "tm-resume" }, h("div", { class: "progress" }, h("i", { style: { width: `${Math.round(target.pct * 100)}%` } })), h("span", null, target.sub)) : null);

    /* --- Afleveringen ------------------------------------------------------------------- */
    let epsEl = null;
    if (t.kind === "series" && eps.length && !up) {
      const seasons = seasonsOf(t.id);
      let season = target?.video.season ?? seasons[0];
      const list = h("div", { class: "tm-eps" });
      const paintEps = () => {
        list.replaceChildren(...eps.filter((v) => v.season === season).map((v, i) => {
          const rec = progressOf(v.id);
          const frac = fraction(rec);
          return h("button", { class: "ep", style: { "--i": i }, onClick: () => navigate(`/watch/${v.id}`) },
            h("span", { class: "ep-num" }, String(v.episode)),
            h("span", { class: "ep-thumb" },
              h("img", { src: thumbUrl(v, t), alt: "", loading: "lazy" }),
              h("span", { class: "ep-play" }, icon("play", { fill: true })),
              rec && frac > 0.01 ? h("span", { class: "progress" }, h("i", { style: { width: `${rec.completed ? 100 : Math.round(frac * 100)}%` } })) : null),
            h("span", { class: "ep-info" },
              h("strong", null, v.name),
              v.description ? h("span", { class: "clamp-2" }, v.description) : null),
            h("span", { class: "ep-dur" }, rec?.completed ? h("span", { class: "ep-done", title: "Bekeken" }, icon("check")) : (fmtDuration(v.duration_seconds) || "")));
        }));
      };
      paintEps();
      epsEl = h("section", { class: "tm-section" },
        h("div", { class: "tm-section-head" }, h("h3", null, "Afleveringen"),
          seasons.length > 1 ? h("select", { class: "select", style: { width: "auto", minHeight: "40px" }, "aria-label": "Seizoen", onChange: (e) => { season = +e.target.value; paintEps(); } },
            seasons.map((s) => h("option", { value: s, selected: s === season }, `Seizoen ${s}`))) : null),
        list);
    }

    /* --- Vergelijkbaar ---------------------------------------------------------------------- */
    const similar = visibleTitles(session.profile).filter((x) => x.id !== t.id && isAvailable(x))
      .map((x) => ({ x, score: (x.genres || []).filter((g) => (t.genres || []).includes(g)).length + (x.kind === t.kind ? 0.5 : 0) }))
      .filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 6).map((s) => s.x);
    const similarEl = similar.length ? h("section", { class: "tm-section" }, h("h3", null, "Meer zoals dit"),
      h("div", { class: "tm-similar", onClick: (e) => { const a = e.target.closest("a.card"); if (a) { e.preventDefault(); navigate(a.getAttribute("href").slice(1), { replace: true }); } } },
        similar.map((x, i) => posterCard(x, { index: i })))) : null;

    /* --- Opbouw ---------------------------------------------------------------------------------- */
    const panel = h("article", { class: "tm", role: "dialog", "aria-modal": "true", "aria-label": t.title },
      h("div", { class: "tm-hero" },
        h("img", { src: backdropUrl(t), alt: "" }),
        h("button", { class: "icon-btn tm-close", "aria-label": "Sluiten", onClick: close }, icon("x")),
        h("div", { class: "tm-hero-content" },
          h("h1", { class: "tm-title" }, t.title),
          t.tagline ? h("p", { class: "tm-tagline" }, t.tagline) : null,
          playRow)),
      h("div", { class: "tm-body" },
        h("div", { class: "tm-cols" },
          h("div", { class: "tm-main" },
            h("div", { class: "hero-meta" }, metaLine(t)),
            t.description ? h("p", { class: "tm-desc" }, t.description) : null),
          h("dl", { class: "tm-side" },
            t.genres?.length ? [h("dt", null, "Genres"), h("dd", null, t.genres.join(", "))] : null,
            h("dt", null, "Kijkwijzer"), h("dd", null, ratingLabel(t.rating)),
            t.kind === "movie" && eps[0]?.duration_seconds ? [h("dt", null, "Speelduur"), h("dd", null, fmtDuration(eps[0].duration_seconds))] : null)),
        epsEl, similarEl));
    backdrop.appendChild(panel);
    panel.tabIndex = -1;
    requestAnimationFrame(() => panel.focus({ preventScroll: true }));

    return () => scope.dispose();
  },
};
