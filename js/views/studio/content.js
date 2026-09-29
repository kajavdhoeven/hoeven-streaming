/* Studio > Content: alle titels in een doorzoekbare tabel, met filters en bulkacties. */

import { h, Scope } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { toast } from "../../ui/toast.js";
import { confirmDialog } from "../../ui/modal.js";
import { fmtHours, fmtDate, fmtDateShort, debounce, kindLabel, plural } from "../../ui/format.js";
import { navigate, reloadRoute } from "../../core/router.js";
import { api } from "../../api/index.js";
import { cat, loadCatalog, isAvailable, isUpcoming, episodesOf } from "../../data/catalog.js";
import { posterThumb, statusBadge, ratingBadge, openMenu, deleteTitleFully, emptyState } from "./layout.js";

const FILTERS = [
  { id: "all", label: "Alles", test: () => true },
  { id: "movie", label: "Films", test: (t) => t.kind === "movie" },
  { id: "series", label: "Series", test: (t) => t.kind === "series" },
  { id: "published", label: "Gepubliceerd", test: (t) => isAvailable(t) },
  { id: "soon", label: "Binnenkort", test: (t) => isUpcoming(t) },
  { id: "draft", label: "Concept", test: (t) => t.status === "draft" },
];

const SORTS = [
  { id: "new", label: "Nieuwste eerst" },
  { id: "az", label: "Titel A-Z" },
  { id: "time", label: "Meeste kijktijd" },
];

export default {
  async mount(root) {
    const scope = new Scope();
    let alive = true;
    scope.add(() => { alive = false; });
    const page = h("div", { class: "st-page" });
    root.appendChild(page);

    page.appendChild(h("div", { class: "st-tablecard" }, [1, 2, 3, 4, 5].map(() => h("div", { class: "skeleton st-sk-row" }))));

    let stats;
    try {
      [, stats] = await Promise.all([loadCatalog(true), api.studio.stats()]);
    } catch (e) {
      if (!alive) return;
      page.replaceChildren(emptyState({ emoji: "😕", title: "Kon de content niet laden", text: e.message, action: h("button", { class: "btn btn-primary", onClick: () => reloadRoute() }, "Opnieuw proberen") }));
      return () => scope.dispose();
    }
    if (!alive) return;

    const watch = new Map();
    for (const r of stats.watch_daily) watch.set(r.title_id, (watch.get(r.title_id) || 0) + r.seconds);

    let q = "";
    let filter = "all";
    let sort = "new";
    const selected = new Set();
    let firstRender = true;

    /* --- Werkbalk ----------------------------------------------------------------- */
    const search = h("input", { class: "input st-search-in", type: "search", placeholder: "Zoek op titel, genre of beschrijving", "aria-label": "Zoeken in content", autocomplete: "off", spellcheck: false });
    const sortSel = h("select", { class: "select st-sort", "aria-label": "Sorteren" }, SORTS.map((s) => h("option", { value: s.id }, s.label)));
    const chipsEl = h("div", { class: "chips st-filters", role: "group", "aria-label": "Filter" });
    const listEl = h("div", { class: "st-tablecard" });
    const bulk = h("div", { class: "st-bulk", role: "region", "aria-label": "Bulkacties", hidden: true });

    page.replaceChildren(
      h("div", { class: "st-toolbar" }, h("label", { class: "st-search" }, icon("search"), search), sortSel),
      chipsEl, listEl,
    );
    // De balk staat los van de pagina, want 'fixed' werkt niet binnen het geanimeerde scherm
    document.body.appendChild(bulk);
    scope.add(() => bulk.remove());

    /* --- Acties ------------------------------------------------------------------------ */
    async function refresh() {
      await loadCatalog(true);
      if (!alive) return;
      for (const id of [...selected]) if (!cat.byId.has(id)) selected.delete(id);
      render();
    }

    async function setStatus(ids, status) {
      const list = ids.map((id) => cat.byId.get(id)).filter((t) => t && t.status !== status);
      if (!list.length) { toast("Er is niets om te wijzigen.", "info"); return; }
      try {
        for (const t of list) await api.studio.titles.save({ id: t.id, status });
        await refresh();
        toast(list.length === 1 ? `"${list[0].title}" staat nu op ${status === "published" ? "gepubliceerd" : "concept"}.` : `${list.length} titels ${status === "published" ? "gepubliceerd" : "naar concept gezet"}.`, "ok");
      } catch (e) { toast(e.message, "error"); await refresh(); }
    }

    async function remove(ids) {
      const list = ids.map((id) => cat.byId.get(id)).filter(Boolean);
      if (!list.length) return;
      const one = list.length === 1;
      const ok = await confirmDialog({
        title: one ? `"${list[0].title}" verwijderen?` : `${list.length} titels verwijderen?`,
        message: `${one ? "Deze titel" : "Deze titels"} met alle video's en afbeeldingen ${one ? "wordt" : "worden"} definitief verwijderd. Dit kun je niet ongedaan maken.`,
        confirmText: "Verwijderen", danger: true,
      });
      if (!ok) return;
      let done = 0;
      try {
        for (const t of list) { await deleteTitleFully(t); selected.delete(t.id); done++; }
        toast(one ? "Titel verwijderd." : `${done} titels verwijderd.`, "ok");
      } catch (e) { toast(e.message, "error"); }
      await refresh();
    }

    /* --- Lijst ------------------------------------------------------------------------------ */
    function visible() {
      const f = FILTERS.find((x) => x.id === filter);
      const needle = q.trim().toLowerCase();
      const list = cat.titles.filter((t) => f.test(t) && (!needle || `${t.title} ${t.tagline || ""} ${t.description || ""} ${(t.genres || []).join(" ")}`.toLowerCase().includes(needle)));
      if (sort === "az") list.sort((a, b) => a.title.localeCompare(b.title, "nl"));
      else if (sort === "time") list.sort((a, b) => (watch.get(b.id) || 0) - (watch.get(a.id) || 0));
      else list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      return list;
    }

    function renderChips() {
      chipsEl.replaceChildren(...FILTERS.map((f) => {
        const n = cat.titles.filter(f.test).length;
        return h("button", { class: `chip${f.id === filter ? " is-active" : ""}`, "aria-pressed": f.id === filter, onClick: () => { filter = f.id; render(); } }, f.label, h("span", { class: "st-chip-n" }, n));
      }));
    }

    function rowMenu(btn, t) {
      const published = t.status === "published";
      openMenu(btn, [
        { label: "Bewerken", icon: "pencil", onClick: () => navigate(`/studio/content/${t.id}`) },
        { label: "Bekijken op platform", icon: "eye", onClick: () => navigate(`/title/${t.id}`) },
        "sep",
        published ? { label: "Naar concept", icon: "pause", onClick: () => setStatus([t.id], "draft") }
          : t.status === "coming_soon" ? { label: "Nu publiceren", icon: "play", onClick: () => setStatus([t.id], "published") }
            : { label: "Publiceren", icon: "play", onClick: () => setStatus([t.id], "published") },
        t.status === "coming_soon" ? { label: "Naar concept", icon: "pause", onClick: () => setStatus([t.id], "draft") } : null,
        "sep",
        { label: "Verwijderen", icon: "trash", danger: true, onClick: () => remove([t.id]) },
      ].filter(Boolean));
    }

    function row(t, i) {
      const n = episodesOf(t.id).length;
      const check = h("input", { class: "st-check", type: "checkbox", checked: selected.has(t.id), "aria-label": `Selecteer ${t.title}`, onChange: () => {
        check.checked ? selected.add(t.id) : selected.delete(t.id);
        tr.classList.toggle("is-selected", check.checked);
        renderBulk(); syncHead();
      } });
      const more = h("button", { class: "st-ib", "aria-label": `Meer acties voor ${t.title}`, "aria-haspopup": "menu", onClick: () => rowMenu(more, t) }, icon("more"));
      const tr = h("tr", { class: `st-tr${selected.has(t.id) ? " is-selected" : ""}${firstRender ? " stagger" : ""}`, style: { "--i": Math.min(i, 12) }, onClick: (e) => { if (!e.target.closest("a,button,input,label")) navigate(`/studio/content/${t.id}`); } },
        h("td", { class: "st-td-check" }, check),
        h("td", { class: "st-td-title" }, h("a", { class: "st-tcell", href: `#/studio/content/${t.id}` }, posterThumb(t),
          h("span", { class: "st-tcell-t" }, h("b", { class: "truncate" }, t.title), h("small", { class: "truncate" }, (t.description || t.tagline || "Nog geen beschrijving").slice(0, 120))))),
        h("td", { class: "st-td-type", dataset: { label: "Type" } }, h("span", { class: "st-type" }, icon(t.kind === "series" ? "tv" : "film"), kindLabel(t.kind))),
        h("td", { class: "st-td-status", dataset: { label: "Status" } }, statusBadge(t), isUpcoming(t) && t.release_at ? h("small", { class: "st-sub" }, fmtDateShort(t.release_at)) : null),
        h("td", { class: "st-td-rating", dataset: { label: "Kijkwijzer" } }, ratingBadge(t.rating)),
        h("td", { class: "st-td-num", dataset: { label: "Video's" } }, n ? plural(n, "video", "video's") : h("span", { class: "st-warn", title: "Nog geen video's toegevoegd" }, "Geen")),
        h("td", { class: "st-td-date", dataset: { label: "Datum" } }, fmtDate(t.created_at)),
        h("td", { class: "st-td-time", dataset: { label: "Kijktijd" } }, watch.get(t.id) ? fmtHours(watch.get(t.id)) : "-"),
        h("td", { class: "st-td-act" }, h("div", { class: "st-acts" },
          h("a", { class: "st-ib", href: `#/studio/content/${t.id}`, "aria-label": `${t.title} bewerken`, title: "Bewerken" }, icon("pencil")),
          h("a", { class: "st-ib", href: `#/title/${t.id}`, "aria-label": `${t.title} bekijken op het platform`, title: "Bekijken op platform" }, icon("eye")),
          more)));
      return tr;
    }

    let headCheck = null;
    function syncHead() {
      if (!headCheck) return;
      const vis = visible();
      const n = vis.filter((t) => selected.has(t.id)).length;
      headCheck.checked = vis.length > 0 && n === vis.length;
      headCheck.indeterminate = n > 0 && n < vis.length;
    }

    function render() {
      renderChips();
      const list = visible();
      // Selectie beperken tot wat zichtbaar is
      const ids = new Set(list.map((t) => t.id));
      for (const id of [...selected]) if (!ids.has(id)) selected.delete(id);

      if (!cat.titles.length) {
        listEl.replaceChildren(emptyState({ emoji: "🎬", title: "Nog geen titels", text: "Voeg je eerste film of serie toe. Dit is het begin van jouw eigen streamingdienst.",
          action: h("a", { class: "btn btn-gradient", href: "#/studio/content/new" }, icon("plus"), "Eerste titel toevoegen") }));
      } else if (!list.length) {
        listEl.replaceChildren(emptyState({ emoji: "🔍", title: "Niets gevonden", text: "Er zijn geen titels die bij je zoekopdracht of filter passen.",
          action: h("button", { class: "btn btn-outline", onClick: () => { q = ""; search.value = ""; filter = "all"; render(); } }, "Filters wissen") }));
      } else {
        headCheck = h("input", { class: "st-check", type: "checkbox", "aria-label": "Alles selecteren", onChange: () => {
          list.forEach((t) => (headCheck.checked ? selected.add(t.id) : selected.delete(t.id)));
          listEl.querySelectorAll("tbody .st-check").forEach((c, i) => { c.checked = headCheck.checked; c.closest("tr").classList.toggle("is-selected", headCheck.checked); });
          renderBulk();
        } });
        listEl.replaceChildren(h("table", { class: "st-table" },
          h("thead", null, h("tr", null,
            h("th", { class: "st-td-check" }, headCheck), h("th", null, "Titel"), h("th", null, "Type"), h("th", null, "Status"), h("th", null, "Kijkwijzer"),
            h("th", { class: "st-td-num" }, "Video's"), h("th", { class: "st-td-date" }, "Toegevoegd"), h("th", null, "Kijktijd"), h("th", { class: "st-td-act" }, h("span", { class: "sr-only" }, "Acties")))),
          h("tbody", null, list.map(row))));
        syncHead();
      }
      firstRender = false;
      renderBulk();
    }

    function renderBulk() {
      const n = selected.size;
      bulk.hidden = !n;
      if (!n) return;
      const ids = [...selected];
      bulk.replaceChildren(
        h("span", { class: "st-bulk-n" }, `${n} geselecteerd`),
        h("button", { class: "btn btn-sm btn-primary", onClick: () => setStatus(ids, "published") }, icon("play"), "Publiceren"),
        h("button", { class: "btn btn-sm btn-outline", "aria-label": "Naar concept", onClick: () => setStatus(ids, "draft") }, icon("pause"), "Concept"),
        h("button", { class: "btn btn-sm btn-danger", onClick: () => remove(ids) }, icon("trash"), "Verwijderen"),
        h("button", { class: "st-ib", "aria-label": "Selectie wissen", onClick: () => { selected.clear(); render(); } }, icon("x")));
    }

    scope.on(search, "input", debounce(() => { q = search.value; render(); }, 160));
    scope.on(sortSel, "change", () => { sort = sortSel.value; render(); });

    render();
    return () => scope.dispose();
  },
};
