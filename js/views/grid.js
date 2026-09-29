/* Films, Series en Mijn lijst: raster met genre-filter en sortering. */

import { h, Scope } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { grid } from "../ui/cards.js";
import { visibleTitles, getTitle } from "../data/catalog.js";
import { ud } from "../data/userdata.js";
import { session } from "../core/session.js";
import { navigate } from "../core/router.js";

const PAGES = {
  movies: { title: "Films", sub: "Losse films en opnames", kind: "movie" },
  series: { title: "Series", sub: "Reeksen met meerdere afleveringen", kind: "series" },
  mylist: { title: "Mijn lijst", sub: "Titels die je hebt bewaard voor later" },
};

export default {
  mount(root, ctx) {
    const scope = new Scope();
    const page = PAGES[ctx.route.name];
    const all = visibleTitles(session.profile);
    const base = ctx.route.name === "mylist"
      ? ud.list.map(getTitle).filter((t) => t && all.some((a) => a.id === t.id))
      : all.filter((t) => t.kind === page.kind);

    let genre = "Alles";
    let sort = ctx.route.name === "mylist" ? "list" : "new";
    const genres = ["Alles", ...new Set(base.flatMap((t) => t.genres || []))];
    const results = h("div");

    const paint = () => {
      let list = base.filter((t) => genre === "Alles" || (t.genres || []).includes(genre));
      if (sort === "az") list = [...list].sort((a, b) => a.title.localeCompare(b.title, "nl"));
      else if (sort === "new") list = [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      results.replaceChildren(list.length ? grid(list) : h("div", { class: "empty" },
        h("div", { class: "empty-icon" }, ctx.route.name === "mylist" ? "🔖" : "🎞️"),
        h("h3", null, ctx.route.name === "mylist" ? "Je lijst is nog leeg" : "Niets gevonden"),
        h("p", null, ctx.route.name === "mylist" ? "Klik op het plusje bij een titel om hem hier te bewaren." : "Probeer een ander genre."),
        ctx.route.name === "mylist" ? h("button", { class: "btn btn-primary", onClick: () => navigate("/browse") }, icon("home"), "Naar de startpagina") : null));
    };

    const chips = h("div", { class: "chips" }, genres.length > 2 ? genres.map((g) => h("button", { class: `chip${g === genre ? " is-active" : ""}`, onClick: (e) => {
      genre = g; [...chips.children].forEach((c) => c.classList.toggle("is-active", c === e.currentTarget)); paint();
    } }, g)) : null);

    root.appendChild(h("section", { class: "pg" },
      h("header", { class: "pg-head" },
        h("div", null, h("h1", null, page.title), h("p", { class: "muted" }, `${page.sub} · ${base.length} ${base.length === 1 ? "titel" : "titels"}`)),
        base.length > 1 && ctx.route.name !== "mylist" ? h("select", { class: "select pg-sort", "aria-label": "Sorteren", onChange: (e) => { sort = e.target.value; paint(); } },
          h("option", { value: "new" }, "Nieuwste eerst"), h("option", { value: "az" }, "A tot Z")) : null),
      chips, results));
    paint();
    return () => scope.dispose();
  },
};
