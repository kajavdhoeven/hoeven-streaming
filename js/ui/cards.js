/* Herbruikbare kaarten en rijen voor de kijkerschermen. */

import { h } from "./dom.js";
import { icon } from "./icons.js";
import { countdown, fmtDuration, fmtDateShort } from "./format.js";
import { isUpcoming, posterUrl, backdropUrl, thumbUrl, episodesOf } from "../data/catalog.js";
import { navigate } from "../core/router.js";

const isNew = (t) => Date.now() - new Date(t.created_at).getTime() < 14 * 86400000;

function image(src, alt) {
  const img = h("img", { src, alt: alt || "", loading: "lazy", decoding: "async", draggable: false });
  img.addEventListener("load", () => img.classList.add("is-loaded"), { once: true });
  if (img.complete && img.naturalWidth) img.classList.add("is-loaded");
  return img;
}

/** Staande posterkaart. */
export function posterCard(title, { index = 0 } = {}) {
  const up = isUpcoming(title);
  const eps = episodesOf(title.id);
  return h("a", { class: `card${up ? " is-upcoming" : ""}`, href: `#/title/${title.id}`, style: { "--i": index }, "aria-label": title.title },
    h("div", { class: "card-poster" },
      image(posterUrl(title), title.title),
      up ? h("div", { class: "card-lock" }, icon("lock"), h("span", null, title.release_at ? `Over ${countdown(title.release_at)}` : "Binnenkort")) : null,
      !up && isNew(title) ? h("span", { class: "card-tag" }, "Nieuw") : null,
      h("div", { class: "card-over" },
        h("strong", { class: "clamp-2" }, title.title),
        h("span", null, up ? (title.release_at ? fmtDateShort(title.release_at) : "Binnenkort") : title.kind === "series" ? `${eps.length} afl.` : fmtDuration(eps[0]?.duration_seconds) || "Film"),
      ),
    ),
  );
}

/** Brede kaart met voortgangsbalk voor "Verder kijken". */
export function continueCard({ title, target }, { index = 0, onRemove } = {}) {
  const v = target.video;
  const label = title.kind === "series" ? `S${v.season} A${v.episode}: ${v.name}` : "Hervatten";
  const el = h("a", { class: "card card-wide", href: `#/watch/${v.id}`, style: { "--i": index }, "aria-label": `${target.label}: ${title.title}` },
    h("div", { class: "card-poster" },
      image(thumbUrl(v, title), title.title),
      h("div", { class: "card-playbtn" }, icon("play", { fill: true })),
      h("div", { class: "card-wide-label" }, h("strong", { class: "truncate" }, title.title), h("span", { class: "truncate" }, label)),
      h("div", { class: "progress" }, h("i", { style: { width: `${Math.round(target.pct * 100)}%` } })),
    ),
    onRemove ? h("button", { class: "card-x", "aria-label": "Verwijderen uit Verder kijken", title: "Verwijderen uit Verder kijken", onClick: (e) => { e.preventDefault(); e.stopPropagation(); onRemove(); } }, icon("x")) : null,
  );
  return el;
}

/** Horizontale rij met pijlen. cards: array van elementen. */
export function row(name, cards, { wide = false, action } = {}) {
  const scroller = h("div", { class: `row-scroller${wide ? " is-wide" : ""}` }, cards);
  const left = h("button", { class: "row-arrow left", "aria-label": "Vorige", onClick: () => scroller.scrollBy({ left: -scroller.clientWidth * 0.85, behavior: "smooth" }) }, icon("chevron-left"));
  const right = h("button", { class: "row-arrow right", "aria-label": "Volgende", onClick: () => scroller.scrollBy({ left: scroller.clientWidth * 0.85, behavior: "smooth" }) }, icon("chevron-right"));
  const update = () => {
    left.classList.toggle("is-off", scroller.scrollLeft < 8);
    right.classList.toggle("is-off", scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 8);
  };
  scroller.addEventListener("scroll", update, { passive: true });
  requestAnimationFrame(update);
  setTimeout(update, 400);
  return h("section", { class: "row", "aria-label": name },
    h("div", { class: "row-head" }, h("h2", null, name), action || null),
    h("div", { class: "row-body" }, left, scroller, right));
}

/** Kaart-raster (voor films/series/mijn lijst/zoeken). */
export function grid(titles) {
  return h("div", { class: "pg-grid" }, titles.map((t, i) => posterCard(t, { index: Math.min(i, 14) })));
}

export function skeletonRow(n = 7, wide = false) {
  return h("section", { class: "row" },
    h("div", { class: "row-head" }, h("div", { class: "skeleton", style: { width: "180px", height: "22px" } })),
    h("div", { class: `row-scroller${wide ? " is-wide" : ""}`, style: { overflow: "hidden" } },
      Array.from({ length: n }, () => h("div", { class: `card ${wide ? "card-wide" : ""}` }, h("div", { class: "card-poster skeleton" })))));
}

export const goTitle = (id) => navigate(`/title/${id}`);
