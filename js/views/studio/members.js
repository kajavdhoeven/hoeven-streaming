/* Studio > Leden: wie mag er kijken, wie is beheerder, wie wacht op goedkeuring. */

import { h, Scope } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { toast } from "../../ui/toast.js";
import { confirmDialog } from "../../ui/modal.js";
import { fmtHours, fmtDate, relTime, plural } from "../../ui/format.js";
import { reloadRoute } from "../../core/router.js";
import { session } from "../../core/session.js";
import { api } from "../../api/index.js";
import { setPending, openMenu, emptyState } from "./layout.js";

const COLORS = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"];
const colorOf = (id) => COLORS[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];

export default {
  async mount(root) {
    const scope = new Scope();
    let alive = true;
    scope.add(() => { alive = false; });
    const page = h("div", { class: "st-page" });
    root.appendChild(page);
    page.appendChild(h("div", { class: "st-tablecard" }, [1, 2, 3, 4].map(() => h("div", { class: "skeleton st-sk-row" }))));

    let members, stats;
    try { [members, stats] = await Promise.all([api.studio.members.list(), api.studio.stats()]); } catch (e) {
      if (!alive) return;
      page.replaceChildren(emptyState({ emoji: "😕", title: "Kon de leden niet laden", text: e.message, action: h("button", { class: "btn btn-primary", onClick: () => reloadRoute() }, "Opnieuw proberen") }));
      return () => scope.dispose();
    }
    if (!alive) return;

    const myId = session.member?.id;
    const profileCount = new Map();
    const owner = new Map();
    for (const p of stats.profiles) { owner.set(p.id, p.owner_id); profileCount.set(p.owner_id, (profileCount.get(p.owner_id) || 0) + 1); }
    const watch = new Map();
    for (const r of stats.watch_daily) { const o = owner.get(r.profile_id); if (o) watch.set(o, (watch.get(o) || 0) + r.seconds); }

    // Het schema kent geen aparte "geblokkeerd"-vlag: wie ooit toegang had (profielen of kijktijd) en nu niet meer goedgekeurd is, geldt als geblokkeerd.
    const revoked = new Set();
    const statusOf = (m) => (m.approved ? "active" : revoked.has(m.id) || profileCount.get(m.id) || watch.get(m.id) ? "blocked" : "pending");
    const name = (m) => m.display_name || m.email;

    const summary = h("p", { class: "muted st-summary" });
    const pendWrap = h("div");
    const tableWrap = h("div", { class: "st-tablecard" });
    page.replaceChildren(summary, pendWrap, tableWrap);

    /* --- Acties ------------------------------------------------------------------------------ */
    async function patch(m, data, msg) {
      try {
        Object.assign(m, await api.studio.members.update(m.id, data));
        toast(msg, "ok");
        render();
      } catch (e) { toast(e.message, "error"); }
    }
    const approve = (m) => patch(m, { approved: true }, `${name(m)} heeft nu toegang.`);
    async function revoke(m) {
      if (!await confirmDialog({ title: "Toegang intrekken?", message: `${name(m)} kan daarna niet meer kijken. Je kunt de toegang later weer herstellen.`, confirmText: "Intrekken", danger: true })) return;
      revoked.add(m.id);
      await patch(m, { approved: false }, `Toegang van ${name(m)} ingetrokken.`);
    }
    async function toggleAdmin(m) {
      const make = m.role !== "admin";
      if (!await confirmDialog({ title: make ? "Beheerder maken?" : "Beheerdersrechten intrekken?",
        message: make ? `${name(m)} kan dan alles in de Studio: titels, rijen en leden beheren.` : `${name(m)} kan daarna alleen nog kijken.`, confirmText: make ? "Beheerder maken" : "Intrekken", danger: !make })) return;
      await patch(m, { role: make ? "admin" : "member" }, make ? `${name(m)} is nu beheerder.` : `${name(m)} is geen beheerder meer.`);
    }
    async function remove(m, pending) {
      if (!await confirmDialog({ title: pending ? "Aanvraag weigeren?" : `${name(m)} verwijderen?`, message: `Het account van ${name(m)} (${m.email}) en alle profielen worden definitief verwijderd.`, confirmText: pending ? "Weigeren" : "Verwijderen", danger: true })) return;
      try {
        await api.studio.members.remove(m.id);
        members = members.filter((x) => x.id !== m.id);
        toast(pending ? "Aanvraag geweigerd." : `${name(m)} is verwijderd.`, "ok");
        render();
      } catch (e) { toast(e.message, "error"); }
    }

    /* --- Weergave ------------------------------------------------------------------------------- */
    const av = (m, size = 42) => h("div", { class: `avatar ${colorOf(m.id)} st-mav`, style: { "--size": `${size}px` }, "aria-hidden": "true" }, (name(m)[0] || "?").toUpperCase());
    const statusBadge = (s) => s === "active" ? h("span", { class: "badge ok" }, "Actief") : s === "pending" ? h("span", { class: "badge warn" }, "Wacht op goedkeuring") : h("span", { class: "badge danger" }, "Geblokkeerd");

    function pendingCard(list) {
      return h("section", { class: "st-card st-pending-hero", "aria-labelledby": "st-mp-h" },
        h("div", { class: "st-card-head" }, h("h3", { id: "st-mp-h" }, icon("mail"), `Wacht op goedkeuring (${list.length})`), h("span", { class: "muted" }, "Zij hebben een account gemaakt en wachten op jou.")),
        h("ul", { class: "st-pend-list" }, list.map((m, i) => h("li", { class: "st-pend-item stagger", style: { "--i": i } },
          av(m, 40),
          h("div", { class: "st-pend-who" }, h("b", { class: "truncate" }, name(m)), h("small", { class: "truncate" }, `${m.email} - aangemeld ${relTime(m.created_at)}`)),
          h("div", { class: "st-pend-act" },
            h("button", { class: "btn btn-sm btn-primary", type: "button", onClick: () => approve(m) }, icon("check"), "Goedkeuren"),
            h("button", { class: "btn btn-sm btn-danger", type: "button", "aria-label": `Weiger ${name(m)}`, onClick: () => remove(m, true) }, icon("x"), "Weigeren"))))));
    }

    function actions(m) {
      const s = statusOf(m);
      const me = m.id === myId;
      if (me) return h("span", { class: "badge" }, "Jij");
      const items = [];
      if (s !== "active") items.push({ label: s === "blocked" ? "Toegang herstellen" : "Goedkeuren", icon: "check", onClick: () => approve(m) });
      if (s === "active") items.push({ label: "Toegang intrekken", icon: "lock", onClick: () => revoke(m) });
      if (m.approved) items.push({ label: m.role === "admin" ? "Beheerdersrechten intrekken" : "Beheerder maken", icon: "shield", onClick: () => toggleAdmin(m) });
      items.push("sep", { label: s === "pending" ? "Weigeren" : "Verwijderen", icon: "trash", danger: true, onClick: () => remove(m, s === "pending") });
      const more = h("button", { class: "st-ib", type: "button", "aria-label": `Acties voor ${name(m)}`, "aria-haspopup": "menu", onClick: () => openMenu(more, items) }, icon("more"));
      return h("div", { class: "st-acts" },
        s !== "active" ? h("button", { class: "btn btn-sm btn-outline", type: "button", onClick: () => approve(m) }, icon("check"), s === "blocked" ? "Herstellen" : "Goedkeuren") : null, more);
    }

    function render() {
      const pend = members.filter((m) => statusOf(m) === "pending");
      setPending(pend.length);
      summary.textContent = `${plural(members.length, "lid", "leden")}, ${members.filter((m) => m.approved).length} met toegang${pend.length ? `, ${pend.length} wachtend` : ""}.`;
      pendWrap.replaceChildren(...(pend.length ? [pendingCard(pend)] : []));
      const sorted = [...members].sort((a, b) => (a.id === myId ? -1 : b.id === myId ? 1 : new Date(a.created_at) - new Date(b.created_at)));
      tableWrap.replaceChildren(h("table", { class: "st-table st-members" },
        h("thead", null, h("tr", null, h("th", null, "Lid"), h("th", null, "Rol"), h("th", null, "Status"), h("th", null, "Lid sinds"), h("th", { class: "st-td-num" }, "Profielen"), h("th", null, "Kijktijd"), h("th", { class: "st-td-act" }, h("span", { class: "sr-only" }, "Acties")))),
        h("tbody", null, sorted.map((m, i) => h("tr", { class: `st-tr st-mrow${m.id === myId ? " is-me" : ""}` },
          h("td", { class: "st-td-title" }, h("div", { class: "st-tcell" }, av(m), h("span", { class: "st-tcell-t" }, h("b", { class: "truncate" }, name(m)), h("small", { class: "truncate" }, m.email)))),
          h("td", { dataset: { label: "Rol" } }, m.role === "admin" ? h("span", { class: "badge soon" }, "Beheerder") : h("span", { class: "badge draft" }, "Lid")),
          h("td", { dataset: { label: "Status" } }, statusBadge(statusOf(m))),
          h("td", { dataset: { label: "Lid sinds" } }, fmtDate(m.created_at)),
          h("td", { class: "st-td-num", dataset: { label: "Profielen" } }, profileCount.get(m.id) || 0),
          h("td", { dataset: { label: "Kijktijd" } }, watch.get(m.id) ? fmtHours(watch.get(m.id)) : "-"),
          h("td", { class: "st-td-act" }, actions(m)))))));
    }

    render();
    return () => scope.dispose();
  },
};
