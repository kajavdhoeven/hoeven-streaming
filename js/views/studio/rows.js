/* Studio > Startpagina: de rijen op de startpagina beheren (volgorde, naam, titels, zichtbaarheid). */

import { h, Scope, prefersReducedMotion, mount } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { toast } from "../../ui/toast.js";
import { openModal, confirmDialog } from "../../ui/modal.js";
import { kindLabel, plural, debounce } from "../../ui/format.js";
import { reloadRoute } from "../../core/router.js";
import { api } from "../../api/index.js";
import { cat, loadCatalog } from "../../data/catalog.js";
import { posterThumb, emptyState } from "./layout.js";

export default {
  async mount(root) {
    const scope = new Scope();
    let alive = true;
    scope.add(() => { alive = false; });
    const page = h("div", { class: "st-page" });
    root.appendChild(page);
    page.appendChild(h("div", { class: "st-rowlist" }, [1, 2, 3].map(() => h("div", { class: "skeleton st-sk-row", style: { height: "92px" } }))));

    try { await loadCatalog(true); } catch (e) {
      if (!alive) return;
      page.replaceChildren(emptyState({ emoji: "😕", title: "Kon de rijen niet laden", text: e.message, action: h("button", { class: "btn btn-primary", onClick: () => reloadRoute() }, "Opnieuw proberen") }));
      return () => scope.dispose();
    }
    if (!alive) return;

    let rows = cat.rows.map((r) => ({ ...r, items: r.items.filter((id) => cat.byId.has(id)) }));
    const list = h("ul", { class: "st-rowlist", "aria-label": "Rijen op de startpagina" });
    const emptyEl = h("div", { hidden: true });

    /* --- Opslagstatus ("Alle wijzigingen opgeslagen") ------------------------------------ */
    const stateEl = h("span", { class: "st-savestate is-ok", role: "status" }, icon("check-circle"), h("span", null, "Alles opgeslagen"));
    let pending = 0;
    async function track(promise) {
      pending++;
      stateEl.className = "st-savestate is-busy";
      stateEl.replaceChildren(h("i", { class: "spinner" }), h("span", null, "Opslaan..."));
      try { return await promise; }
      catch (e) {
        stateEl.className = "st-savestate is-err";
        stateEl.replaceChildren(icon("alert"), h("span", null, "Opslaan mislukt"));
        toast(e.message, "error");
        throw e;
      } finally {
        if (--pending === 0 && !stateEl.classList.contains("is-err")) {
          stateEl.className = "st-savestate is-ok";
          stateEl.replaceChildren(icon("check-circle"), h("span", null, "Alles opgeslagen"));
        }
        loadCatalog(true).catch(() => {});
      }
    }

    /* --- Verplaatsen met animatie ------------------------------------------------------------- */
    function flip(mutate) {
      const first = new Map([...list.children].map((e) => [e, e.getBoundingClientRect().top]));
      mutate();
      if (prefersReducedMotion()) return;
      for (const e of list.children) {
        const d = first.get(e) - e.getBoundingClientRect().top;
        if (d) e.animate([{ transform: `translateY(${d}px)` }, { transform: "none" }], { duration: 340, easing: "cubic-bezier(.16,1,.3,1)" });
      }
    }
    const orderFromDom = () => { const ids = [...list.children].map((e) => e.dataset.id); rows.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)); return ids; };
    const persistOrder = () => track(api.studio.rows.reorder(rows.map((r) => r.id))).catch(() => {});
    function syncMoveButtons() {
      [...list.children].forEach((el, i) => {
        el.querySelector('[data-act="up"]').disabled = i === 0;
        el.querySelector('[data-act="down"]').disabled = i === list.children.length - 1;
      });
    }

    /* --- Een rij ------------------------------------------------------------------------------------- */
    function metaOf(r, li) {
      const titles = r.items.map((id) => cat.byId.get(id)).filter(Boolean);
      const stack = h("span", { class: "st-stack", "aria-hidden": "true" }, titles.slice(0, 4).map((t) => posterThumb(t)));
      mount(li.querySelector(".st-row-meta"), stack, h("span", null, titles.length ? plural(titles.length, "titel", "titels") : "Nog geen titels"),
        !r.visible ? h("span", { class: "badge draft" }, "Verborgen") : null,
        titles.some((t) => t.status === "draft") ? h("span", { class: "badge warn", title: "Concepten zijn niet zichtbaar voor kijkers" }, "Bevat concept") : null);
    }

    function rowEl(r, i = 0, animate = true) {
      const nameIn = h("input", { class: "st-row-name", type: "text", value: r.name, maxLength: 60, "aria-label": "Naam van de rij", spellcheck: false });
      const vis = h("input", { type: "checkbox", checked: r.visible });
      const li = h("li", { class: `st-rowitem${animate ? " stagger" : ""}`, dataset: { id: r.id }, style: { "--i": Math.min(i, 8) } },
        h("button", { class: "st-grip", type: "button", "aria-label": `Sleep ${r.name} om te verplaatsen`, title: "Sleep om te verplaatsen" }, icon("grip")),
        h("div", { class: "st-row-main" }, nameIn, h("div", { class: "st-row-meta" })),
        h("label", { class: "switch st-row-vis", title: "Toon deze rij op de startpagina" }, vis, h("span", { class: "track" }), h("span", { class: "st-row-vis-l" }, "Zichtbaar")),
        h("div", { class: "st-acts" },
          h("button", { class: "btn btn-outline btn-sm", type: "button", onClick: () => pickTitles(r, li) }, icon("list"), h("span", null, "Titels kiezen")),
          h("button", { class: "st-ib", type: "button", dataset: { act: "up" }, "aria-label": `${r.name} omhoog`, title: "Omhoog", onClick: (e) => move(li, -1, e.currentTarget) }, icon("chevron-up")),
          h("button", { class: "st-ib", type: "button", dataset: { act: "down" }, "aria-label": `${r.name} omlaag`, title: "Omlaag", onClick: (e) => move(li, 1, e.currentTarget) }, icon("chevron-down")),
          h("button", { class: "st-ib is-danger", type: "button", "aria-label": `${r.name} verwijderen`, title: "Verwijderen", onClick: () => removeRow(r, li) }, icon("trash"))));
      metaOf(r, li);

      // Naam opslaan bij Enter of als je het veld verlaat
      scope.on(nameIn, "keydown", (e) => { if (e.key === "Enter") nameIn.blur(); if (e.key === "Escape") { nameIn.value = r.name; nameIn.blur(); } });
      scope.on(nameIn, "blur", async () => {
        const v = nameIn.value.trim();
        if (!v) { nameIn.value = r.name; toast("Een rij heeft een naam nodig.", "error"); return; }
        if (v === r.name) return;
        const old = r.name;
        r.name = v;
        try { await track(api.studio.rows.save({ id: r.id, name: v })); } catch { r.name = old; nameIn.value = old; }
      });
      scope.on(vis, "change", async () => {
        r.visible = vis.checked; metaOf(r, li);
        try { await track(api.studio.rows.save({ id: r.id, visible: r.visible })); } catch { r.visible = !r.visible; vis.checked = r.visible; metaOf(r, li); }
      });

      // Slepen: alleen vanaf de sleepgreep
      const grip = li.querySelector(".st-grip");
      grip.addEventListener("pointerdown", () => { li.draggable = true; });
      grip.addEventListener("pointerup", () => { li.draggable = false; });
      li.addEventListener("dragstart", (e) => { li.classList.add("is-dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", r.id); });
      li.addEventListener("dragend", () => { li.draggable = false; li.classList.remove("is-dragging"); orderFromDom(); syncMoveButtons(); persistOrder(); });
      return li;
    }

    function move(li, dir, btn) {
      const other = dir < 0 ? li.previousElementSibling : li.nextElementSibling;
      if (!other) return;
      flip(() => (dir < 0 ? list.insertBefore(li, other) : list.insertBefore(other, li)));
      orderFromDom(); syncMoveButtons(); persistOrder();
      (btn.disabled ? li.querySelector(`[data-act="${dir < 0 ? "down" : "up"}"]`) : btn).focus();
    }

    scope.on(list, "dragover", (e) => {
      const dragging = list.querySelector(".is-dragging");
      if (!dragging) return;
      e.preventDefault();
      const after = [...list.children].filter((c) => c !== dragging).find((c) => { const b = c.getBoundingClientRect(); return e.clientY < b.top + b.height / 2; }) || null;
      if (dragging.nextElementSibling !== after) list.insertBefore(dragging, after);
    });

    async function removeRow(r, li) {
      if (!await confirmDialog({ title: `Rij "${r.name}" verwijderen?`, message: "De rij verdwijnt van de startpagina. De titels zelf blijven bestaan.", confirmText: "Verwijderen", danger: true })) return;
      try {
        await track(api.studio.rows.remove(r.id));
        rows = rows.filter((x) => x.id !== r.id);
        li.classList.add("is-leaving");
        setTimeout(() => { li.remove(); syncMoveButtons(); paintEmpty(); }, prefersReducedMotion() ? 0 : 300);
        toast("Rij verwijderd.", "ok");
      } catch { /* melding staat al */ }
    }

    async function addRow() {
      try {
        const r = await track(api.studio.rows.save({ name: "Nieuwe rij", position: rows.length, visible: true }));
        const row = { items: [], visible: true, ...r };
        rows.push(row);
        const li = rowEl(row);
        list.appendChild(li);
        syncMoveButtons(); paintEmpty();
        li.scrollIntoView({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
        const inp = li.querySelector(".st-row-name");
        inp.focus(); inp.select();
      } catch { /* melding staat al */ }
    }

    /* --- Titels kiezen --------------------------------------------------------------------------------- */
    function pickTitles(r, li) {
      let sel = [...r.items];
      const search = h("input", { class: "input", type: "search", placeholder: "Zoek een titel", "aria-label": "Titels zoeken", autocomplete: "off" });
      const left = h("ul", { class: "st-pick-list", "aria-label": "Alle titels" });
      const right = h("ol", { class: "st-pick-list st-pick-sel", "aria-label": "Titels in deze rij" });
      const count = h("span", { class: "st-pick-n" });

      function paintLeft() {
        const q = search.value.trim().toLowerCase();
        const items = cat.titles.filter((t) => !q || `${t.title} ${(t.genres || []).join(" ")}`.toLowerCase().includes(q));
        left.replaceChildren(...(items.length ? items.map((t) => {
          const on = sel.includes(t.id);
          const cb = h("input", { class: "st-check", type: "checkbox", checked: on, onChange: () => { sel = cb.checked ? [...sel, t.id] : sel.filter((x) => x !== t.id); paintRight(); } });
          return h("li", null, h("label", { class: "st-pick-row" }, cb, posterThumb(t), h("span", { class: "st-pick-t" }, h("b", { class: "truncate" }, t.title), h("small", null, kindLabel(t.kind))),
            t.status === "draft" ? h("span", { class: "badge draft" }, "Concept") : t.status === "coming_soon" ? h("span", { class: "badge soon" }, "Binnenkort") : null));
        }) : [h("li", { class: "st-none" }, "Geen titels gevonden.")]));
      }
      function paintRight() {
        count.textContent = sel.length;
        right.replaceChildren(...(sel.length ? sel.map((id, i) => {
          const t = cat.byId.get(id);
          if (!t) return null;
          return h("li", { class: "st-pick-row is-sel" }, h("span", { class: "st-rank" }, i + 1), posterThumb(t), h("span", { class: "st-pick-t" }, h("b", { class: "truncate" }, t.title)),
            h("span", { class: "st-acts" },
              h("button", { class: "st-ib", type: "button", disabled: i === 0, "aria-label": `${t.title} omhoog`, onClick: () => { [sel[i - 1], sel[i]] = [sel[i], sel[i - 1]]; paintRight(); } }, icon("chevron-up")),
              h("button", { class: "st-ib", type: "button", disabled: i === sel.length - 1, "aria-label": `${t.title} omlaag`, onClick: () => { [sel[i + 1], sel[i]] = [sel[i], sel[i + 1]]; paintRight(); } }, icon("chevron-down")),
              h("button", { class: "st-ib", type: "button", "aria-label": `${t.title} uit de rij halen`, onClick: () => { sel = sel.filter((x) => x !== id); paintRight(); paintLeft(); } }, icon("x"))));
        }).filter(Boolean) : [h("li", { class: "st-none" }, "Vink links titels aan. Hier kun je de volgorde aanpassen.")]));
      }
      scope.on(search, "input", debounce(paintLeft, 120));
      paintLeft(); paintRight();

      const save = h("button", { class: "btn btn-gradient", type: "button", onClick: async () => {
        save.classList.add("is-loading");
        try {
          await track(api.studio.rows.setItems(r.id, sel));
          r.items = sel; metaOf(r, li);
          modal.close();
          toast("Rij bijgewerkt.", "ok");
        } catch { /* melding staat al */ }
        save.classList.remove("is-loading");
      } }, icon("check"), "Opslaan");
      const modal = openModal({ title: `Titels in "${r.name}"`, wide: true,
        body: h("div", { class: "st-pick" },
          h("div", { class: "st-pick-col" }, h("div", { class: "label" }, "Alle titels"), search, left),
          h("div", { class: "st-pick-col" }, h("div", { class: "label" }, "In deze rij ", count), right)),
        footer: [h("button", { class: "btn btn-outline", type: "button", onClick: () => modal.close() }, "Annuleren"), save] });
    }

    /* --- Opbouw ---------------------------------------------------------------------------------------------- */
    function paintEmpty() {
      const none = !rows.length;
      emptyEl.hidden = !none;
      list.hidden = none;
      if (none) emptyEl.replaceChildren(emptyState({ emoji: "🎞️", title: "Nog geen rijen", text: "Rijen zijn de horizontale lijsten op de startpagina, zoals 'Nieuw op Hoeven+'. Maak je eerste rij.",
        action: h("button", { class: "btn btn-gradient", type: "button", onClick: addRow }, icon("plus"), "Nieuwe rij") }));
    }

    list.append(...rows.map((r, i) => rowEl(r, i)));
    page.replaceChildren(
      h("div", { class: "st-rows-head" },
        h("div", { class: "st-tip-box" }, icon("info"),
          h("p", null, h("b", null, "Automatisch: "), "Verder kijken, Mijn lijst en Binnenkort staan altijd op de startpagina en hoef je hier niet te beheren. Uitgelichte titels komen in de grote hero bovenaan (zet dat aan in de editor van een titel).")),
        h("div", { class: "st-rows-bar" }, stateEl, h("button", { class: "btn btn-gradient btn-sm", type: "button", onClick: addRow }, icon("plus"), "Nieuwe rij"))),
      list, emptyEl);
    syncMoveButtons(); paintEmpty();
    return () => scope.dispose();
  },
};
