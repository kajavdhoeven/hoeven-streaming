/* Studio > Dashboard: kerncijfers, kijktijd per dag, populairste titels en wie er wacht op goedkeuring. */

import { h, Scope, prefersReducedMotion, mount } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { avatar } from "../../ui/avatar.js";
import { toast } from "../../ui/toast.js";
import { confirmDialog } from "../../ui/modal.js";
import { fmtHours, fmtNumber, fmtDate, relTime, kindLabel } from "../../ui/format.js";
import { navigate, reloadRoute } from "../../core/router.js";
import { api } from "../../api/index.js";
import { cat, loadCatalog, isAvailable, isUpcoming } from "../../data/catalog.js";
import { countUp, posterThumb, setPending, emptyState } from "./layout.js";

const DAY = 86400000;
const dayKey = (t) => new Date(t).toISOString().slice(0, 10);

function skeleton() {
  const sk = (cls, hgt) => h("div", { class: `skeleton ${cls}`, style: { height: hgt } });
  return h("div", { class: "st-dash", "aria-busy": "true" },
    h("div", { class: "st-stats" }, [1, 2, 3, 4].map(() => sk("st-sk-card", "118px"))),
    h("div", { class: "st-dash-grid" }, sk("st-sk-wide", "330px"), sk("", "330px"), sk("", "300px"), sk("", "300px")),
  );
}

/** Mooie bovengrens voor de y-as (veelvoud van 2 stappen). */
function niceMax(max) {
  const unit = max >= 3600 ? 1800 : 300;
  return Math.max(2 * unit, Math.ceil(max / (2 * unit)) * 2 * unit);
}

function buildChart(days, perDay, viewers, scope) {
  const max = niceMax(Math.max(0, ...perDay.values()));
  const tip = h("div", { class: "st-tip", role: "presentation" });
  const plot = h("div", { class: "st-plot" });
  const bars = h("div", { class: "st-bars" }, days.map((d, i) => {
    const sec = perDay.get(d);
    const date = new Date(`${d}T12:00:00`);
    const label = `${date.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}: ${sec ? fmtHours(sec) : "geen kijktijd"}`;
    const col = h("div", { class: "st-col", role: "img", "aria-label": label },
      h("i", { class: `st-bar${sec ? "" : " is-zero"}`, style: { "--h": `${Math.max(sec / max * 100, sec ? 2 : 0)}%`, "--i": i } }));
    const show = () => {
      mount(tip, h("b", null, date.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" })), h("span", null, sec ? fmtHours(sec) : "Geen kijktijd"), sec ? h("small", null, `${viewers.get(d)?.size || 0} kijkers`) : null);
      tip.classList.add("is-on");
      const c = bars.offsetLeft + col.offsetLeft + col.offsetWidth / 2;
      const half = tip.offsetWidth / 2;
      tip.style.left = `${Math.min(Math.max(c, half + 4), plot.clientWidth - half - 4)}px`;
      col.classList.add("is-hover");
    };
    const hide = () => { tip.classList.remove("is-on"); col.classList.remove("is-hover"); };
    col.addEventListener("pointerenter", show);
    col.addEventListener("pointerdown", show);
    col.addEventListener("pointerleave", hide);
    return col;
  }));
  scope.on(document, "pointerdown", (e) => { if (!plot.contains(e.target)) tip.classList.remove("is-on"); });
  const ticks = [max, max / 2, 0];
  const lines = h("div", { class: "st-ylines", "aria-hidden": "true" }, ticks.map((v) => h("div", { class: "st-yl" }, h("span", null, v ? fmtHours(v) : "0"))));
  const xl = h("div", { class: "st-xl", "aria-hidden": "true" }, days.map((d, i) => h("span", null, i % 5 === 4 ? new Date(`${d}T12:00:00`).toLocaleDateString("nl-NL", { day: "numeric", month: "short" }) : "")));
  plot.append(lines, bars, tip);
  return h("div", { class: "st-chart-wrap" }, plot, xl);
}

export default {
  async mount(root) {
    const scope = new Scope();
    let alive = true;
    scope.add(() => { alive = false; });
    const page = h("div", { class: "st-page" });
    root.appendChild(page);
    page.appendChild(skeleton());

    let stats;
    try {
      [stats] = await Promise.all([api.studio.stats(), loadCatalog(true)]);
    } catch (e) {
      if (!alive) return;
      page.replaceChildren(emptyState({ emoji: "😕", title: "Kon de cijfers niet laden", text: e.message, action: h("button", { class: "btn btn-primary", onClick: () => reloadRoute() }, "Opnieuw proberen") }));
      return () => scope.dispose();
    }
    if (!alive) return;

    const { members, profiles, watch_daily, watch_progress } = stats;
    const profileById = new Map(profiles.map((p) => [p.id, p]));

    /* --- Cijfers -------------------------------------------------------------- */
    const now = Date.now();
    const days = Array.from({ length: 30 }, (_, i) => dayKey(now - (29 - i) * DAY));
    const prevFrom = dayKey(now - 59 * DAY);
    const perDay = new Map(days.map((d) => [d, 0]));
    const viewersPerDay = new Map();
    const perTitle = new Map();
    const active = new Set();
    let total = 0, prev = 0;
    for (const r of watch_daily) {
      if (r.day >= days[0]) {
        if (!perDay.has(r.day)) continue;
        perDay.set(r.day, perDay.get(r.day) + r.seconds);
        total += r.seconds;
        active.add(r.profile_id);
        if (!viewersPerDay.has(r.day)) viewersPerDay.set(r.day, new Set());
        viewersPerDay.get(r.day).add(r.profile_id);
        perTitle.set(r.title_id, (perTitle.get(r.title_id) || 0) + r.seconds);
      } else if (r.day >= prevFrom) prev += r.seconds;
    }

    const titles = cat.titles;
    const nPub = titles.filter((t) => isAvailable(t)).length;
    const nSoon = titles.filter(isUpcoming).length;
    const nDraft = titles.filter((t) => t.status === "draft").length;
    const pendingMembers = () => members.filter((m) => !m.approved);

    const stat = (cls, ico, label, value, fmt, sub) => {
      const val = h("span", { class: "st-stat-v" }, "0");
      scope.add(countUp(val, value, { format: fmt }));
      const subEl = h("div", { class: "st-stat-s" }, sub);
      return { el: h("div", { class: `st-card st-stat stagger ${cls}`, style: { "--i": cls === "s1" ? 0 : cls === "s2" ? 1 : cls === "s3" ? 2 : 3 } },
        h("div", { class: "st-stat-ico" }, icon(ico)), h("div", { class: "st-stat-l" }, label), val, subEl), subEl };
    };

    let delta = null;
    if (prev > 0) {
      const pct = Math.round((total - prev) / prev * 100);
      delta = h("span", { class: `st-delta ${pct >= 0 ? "up" : "down"}` }, `${pct >= 0 ? "+" : ""}${pct}% t.o.v. vorige 30 dagen`);
    }
    const s1 = stat("s1", "clock", "Kijktijd, laatste 30 dagen", total, fmtHours, delta || "Totaal over alle kijkers");
    const s2 = stat("s2", "eye", "Actieve kijkers", active.size, fmtNumber, `van ${fmtNumber(profiles.length)} profielen`);
    const s3 = stat("s3", "film", "Titels", titles.length, fmtNumber, `${nPub} gepubliceerd, ${nSoon} binnenkort, ${nDraft} concept`);
    const memberSub = () => (pendingMembers().length ? h("span", { class: "st-warn" }, `+ ${pendingMembers().length} wachtend`) : "Iedereen is goedgekeurd");
    const s4 = stat("s4", "users", "Leden", members.filter((m) => m.approved).length, fmtNumber, memberSub());

    /* --- Grafiek ----------------------------------------------------------------- */
    const chartCard = h("section", { class: "st-card st-chart stagger", style: { "--i": 4 }, "aria-labelledby": "st-chart-h" },
      h("div", { class: "st-card-head" }, h("h3", { id: "st-chart-h" }, "Kijktijd per dag"), h("span", { class: "muted" }, total ? `${fmtHours(total)} in 30 dagen` : "Laatste 30 dagen")),
      buildChart(days, perDay, viewersPerDay, scope));

    /* --- Wacht op goedkeuring ------------------------------------------------------ */
    const pendList = h("ul", { class: "st-pend-list" });
    const pendCard = h("section", { class: "st-card st-pending stagger", style: { "--i": 5 }, "aria-labelledby": "st-pend-h" },
      h("div", { class: "st-card-head" }, h("h3", { id: "st-pend-h" }, "Wacht op goedkeuring")), pendList);
    const syncPending = () => {
      const list = pendingMembers();
      setPending(list.length);
      s4.subEl.replaceChildren(memberSub());
      pendCard.classList.toggle("has-items", list.length > 0);
      if (!list.length && !pendList.querySelector("li")) pendList.replaceChildren(h("li", { class: "st-pend-none" }, icon("check-circle"), "Alles bijgewerkt, niemand wacht nog."));
    };
    const memberRow = (m) => {
      const li = h("li", { class: "st-pend-item" });
      const busy = (on) => li.querySelectorAll("button").forEach((b) => { b.disabled = on; });
      const leave = () => { li.classList.add("is-leaving"); setTimeout(() => { li.remove(); syncPending(); }, prefersReducedMotion() ? 0 : 320); };
      li.append(
        h("span", { class: "st-mini-av" }, (m.display_name || m.email)[0].toUpperCase()),
        h("div", { class: "st-pend-who" }, h("b", { class: "truncate" }, m.display_name || m.email), h("small", { class: "truncate" }, `${m.email} - ${relTime(m.created_at)}`)),
        h("div", { class: "st-pend-act" },
          h("button", { class: "btn btn-sm btn-primary", onClick: async () => {
            busy(true);
            try { await api.studio.members.update(m.id, { approved: true }); m.approved = true; toast(`${m.display_name || m.email} is goedgekeurd.`, "ok"); leave(); }
            catch (e) { toast(e.message, "error"); busy(false); }
          } }, icon("check"), "Goedkeuren"),
          h("button", { class: "btn btn-sm btn-danger", "aria-label": `Weiger ${m.display_name || m.email}`, onClick: async () => {
            if (!await confirmDialog({ title: "Aanvraag weigeren?", message: `Het account van ${m.display_name || m.email} (${m.email}) wordt verwijderd.`, confirmText: "Weigeren", danger: true })) return;
            busy(true);
            try { await api.studio.members.remove(m.id); members.splice(members.indexOf(m), 1); toast("Aanvraag geweigerd.", "info"); leave(); }
            catch (e) { toast(e.message, "error"); busy(false); }
          } }, icon("x"), "Weigeren")));
      return li;
    };
    pendingMembers().forEach((m) => pendList.appendChild(memberRow(m)));
    syncPending();

    /* --- Snelle acties ---------------------------------------------------------------- */
    const quick = h("section", { class: "st-card st-quick stagger", style: { "--i": 6 }, "aria-labelledby": "st-quick-h" },
      h("div", { class: "st-card-head" }, h("h3", { id: "st-quick-h" }, "Snelle acties")),
      h("div", { class: "st-quick-btns" },
        h("button", { class: "btn btn-gradient", onClick: () => navigate("/studio/content/new") }, icon("plus"), "Nieuwe titel"),
        h("button", { class: "btn btn-outline", onClick: () => navigate("/studio/rows") }, icon("grid"), "Rijen beheren"),
        h("button", { class: "btn btn-outline", onClick: () => navigate("/studio/content") }, icon("video"), "Alle content")));

    /* --- Populairste titels --------------------------------------------------------------- */
    const top = [...perTitle.entries()].filter(([id]) => cat.byId.has(id)).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topMax = top[0]?.[1] || 1;
    const popular = h("section", { class: "st-card stagger", style: { "--i": 7 }, "aria-labelledby": "st-pop-h" },
      h("div", { class: "st-card-head" }, h("h3", { id: "st-pop-h" }, "Populairste titels"), h("span", { class: "muted" }, "op kijktijd")),
      top.length ? h("ol", { class: "st-pop" }, top.map(([id, sec], i) => {
        const t = cat.byId.get(id);
        return h("li", null, h("a", { class: "st-pop-row", href: `#/studio/content/${id}` },
          h("span", { class: "st-rank" }, i + 1), posterThumb(t),
          h("span", { class: "st-pop-mid" }, h("span", { class: "st-pop-t truncate" }, t.title),
            h("span", { class: "st-hbar" }, h("i", { style: { width: `${Math.max(4, sec / topMax * 100)}%`, "animation-delay": `${0.3 + i * 0.08}s` } }))),
          h("span", { class: "st-pop-time" }, fmtHours(sec))));
      })) : h("p", { class: "st-none" }, "Nog geen kijkcijfers. Zodra iemand iets kijkt, verschijnt het hier."));

    /* --- Recent bekeken --------------------------------------------------------------------- */
    const recent = [...watch_progress].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 6);
    const recentCard = h("section", { class: "st-card stagger", style: { "--i": 8 }, "aria-labelledby": "st-rec-h" },
      h("div", { class: "st-card-head" }, h("h3", { id: "st-rec-h" }, "Recent bekeken")),
      recent.length ? h("ul", { class: "st-recent" }, recent.map((r) => {
        const p = profileById.get(r.profile_id);
        const t = cat.byId.get(r.title_id);
        const v = cat.videos.get(r.video_id);
        const ep = t?.kind === "series" && v ? `S${v.season} A${v.episode}: ${v.name}` : v?.name;
        return h("li", { class: "st-recent-row" },
          p ? avatar(p, { size: 36 }) : h("span", { class: "st-mini-av" }, "?"),
          h("div", { class: "st-recent-mid" }, h("b", { class: "truncate" }, `${p?.name || "Onbekend"} keek ${t?.title || "een verwijderde titel"}`), h("small", { class: "truncate" }, ep || kindLabel(t?.kind))),
          h("time", { class: "st-recent-time", datetime: r.updated_at, title: fmtDate(r.updated_at) }, relTime(r.updated_at)));
      })) : h("p", { class: "st-none" }, "Nog niets bekeken."));

    page.replaceChildren(
      h("div", { class: "st-stats" }, s1.el, s2.el, s3.el, s4.el),
      h("div", { class: "st-dash-grid" },
        h("div", { class: "st-area-chart" }, chartCard),
        h("div", { class: "st-area-side" }, pendCard, quick),
        h("div", { class: "st-area-pop" }, popular),
        h("div", { class: "st-area-rec" }, recentCard)));

    return () => scope.dispose();
  },
};
