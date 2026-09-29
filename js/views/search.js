/* Zoeken over titels, genres en beschrijvingen. */

import { h, Scope } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { grid } from "../ui/cards.js";
import { visibleTitles, searchTitles } from "../data/catalog.js";
import { session } from "../core/session.js";
import { search, searchBus, setQuery } from "../core/search-bus.js";
import { currentPath } from "../core/router.js";

export default {
  mount(root, ctx) {
    const scope = new Scope();
    const all = visibleTitles(session.profile);
    search.q = ctx.query.q ?? search.q ?? "";

    const results = h("div", { class: "search-results" });
    const input = h("input", { class: "input search-page-input", type: "search", placeholder: "Zoek op titel of genre", "aria-label": "Zoeken", autocomplete: "off", value: search.q,
      onInput: (e) => { setQuery(e.target.value, "page"); if (currentPath() === "/search") history.replaceState(history.state, "", `#/search?q=${encodeURIComponent(e.target.value)}`); } });

    function paint() {
      const q = search.q.trim();
      if (!q) {
        const genres = [...new Set(all.flatMap((t) => t.genres || []))].sort((a, b) => a.localeCompare(b, "nl"));
        results.replaceChildren(h("div", { class: "search-hint" },
          h("div", { class: "empty-icon" }, icon("search")),
          h("h2", null, "Waar heb je zin in?"),
          h("p", { class: "muted" }, "Zoek op titel, genre of jaar. Of kies een genre:"),
          h("div", { class: "chips", style: { justifyContent: "center" } }, genres.map((g) => h("button", { class: "chip", onClick: () => { input.value = g; setQuery(g, "page"); history.replaceState(history.state, "", `#/search?q=${encodeURIComponent(g)}`); input.focus(); } }, g)))));
        return;
      }
      const found = searchTitles(all, q);
      results.replaceChildren(found.length
        ? h("div", null, h("p", { class: "muted", style: { marginBottom: "18px" } }, `${found.length} ${found.length === 1 ? "resultaat" : "resultaten"} voor "${q}"`), grid(found))
        : h("div", { class: "empty" }, h("div", { class: "empty-icon" }, "🤷"), h("h3", null, "Niets gevonden"), h("p", null, `Er is niets dat past bij "${q}". Controleer de spelling of probeer een genre.`)));
    }

    root.appendChild(h("section", { class: "pg" }, h("div", { class: "search-field" }, icon("search"), input), results));
    paint();
    scope.on(searchBus, "query", (e) => { if (e.detail.source !== "page") input.value = e.detail.q; paint(); });
    if (matchMedia("(max-width: 760px)").matches && !search.q) requestAnimationFrame(() => input.focus());
    return () => scope.dispose();
  },
};
