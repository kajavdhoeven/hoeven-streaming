/* De schil rond de Studio: zijbalk (desktop) of onderbalk (mobiel), bovenbalk en gedeelde hulpjes voor de Studio-schermen. */

import { h, Scope, prefersReducedMotion } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { session } from "../../core/session.js";
import { navigate } from "../../core/router.js";
import { api } from "../../api/index.js";
import { isUpcoming, episodesOf, posterUrl } from "../../data/catalog.js";
import { fmtNumber, ratingLabel } from "../../ui/format.js";

const NAV = [
  { path: "/studio", label: "Dashboard", short: "Dashboard", icon: "gauge", match: ["studio"] },
  { path: "/studio/content", label: "Content", short: "Content", icon: "video", match: ["studio-content", "studio-new", "studio-edit"] },
  { path: "/studio/rows", label: "Startpagina", short: "Rijen", icon: "grid", match: ["studio-rows"] },
  { path: "/studio/members", label: "Leden", short: "Leden", icon: "users", match: ["studio-members"], badge: true },
  { path: "/studio/settings", label: "Instellingen", short: "Opties", icon: "settings", match: ["studio-settings"] },
];

const TITLES = {
  studio: "Dashboard", "studio-content": "Content", "studio-new": "Nieuwe titel", "studio-edit": "Titel bewerken",
  "studio-rows": "Startpagina", "studio-members": "Leden", "studio-settings": "Instellingen",
};

/* --- Gedeelde hulpjes ----------------------------------------------------------- */

let pendingEls = [];
let pendingCount = 0;

/** Zet het aantal wachtende leden in de zijbalk (aanroepen na elke wijziging aan leden). */
export function setPending(n) {
  pendingCount = n;
  for (const el of pendingEls) { el.textContent = n; el.hidden = !n; }
}

export const isStoragePath = (p) => !!p && !/^(https?:|data:|blob:|demo:)/.test(p);

export function statusBadge(t) {
  if (t.status === "draft") return h("span", { class: "badge draft" }, "Concept");
  if (isUpcoming(t)) return h("span", { class: "badge soon" }, "Binnenkort");
  return h("span", { class: "badge ok" }, "Gepubliceerd");
}

export const ratingBadge = (r) => h("span", { class: `rating-badge r-${r}`, title: ratingLabel(r) }, r);

/** Klein staand plaatje (of een lege plek als er geen poster is). */
export function posterThumb(t, cls = "") {
  const url = posterUrl(t);
  return h("span", { class: `st-poster ${cls}` }, url ? h("img", { src: url, alt: "", loading: "lazy", draggable: false }) : icon("image"));
}

export function emptyState({ emoji = "🎬", title, text, action }) {
  return h("div", { class: "empty" }, h("div", { class: "empty-icon" }, emoji), h("h3", null, title), text ? h("p", null, text) : null, action || null);
}

/** Getal laten oplopen. Geeft een stop-functie terug. */
export function countUp(el, to, { format = fmtNumber, dur = 1100 } = {}) {
  if (prefersReducedMotion() || !to) { el.textContent = format(to); return () => {}; }
  let raf = 0;
  const t0 = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - t0) / dur);
    el.textContent = format(Math.round(to * (1 - Math.pow(1 - p, 3))));
    if (p < 1) raf = requestAnimationFrame(tick);
  };
  el.textContent = format(0);
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

/** Voortgangsring (SVG met merkgradient). ring.set(0..1) */
let ringId = 0;
export function progressRing({ size = 72, stroke = 7 } = {}) {
  const id = `st-ring-${++ringId}`;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
  svg.setAttribute("class", "st-ring-svg");
  svg.style.width = svg.style.height = `${size}px`;
  svg.innerHTML = `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2fbdf5"/><stop offset=".5" stop-color="#8b4ea2"/><stop offset="1" stop-color="#f0492a"/></linearGradient></defs>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(255,255,255,.12)" stroke-width="${stroke}"/>
    <circle class="st-ring-arc" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="url(#${id})" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
  const arc = svg.querySelector(".st-ring-arc");
  const label = h("span", { class: "st-ring-label" }, "0%");
  const el = h("div", { class: "st-ring", style: { width: `${size}px`, height: `${size}px` } }, svg, label);
  return { el, set(p) { p = Math.max(0, Math.min(1, p)); arc.style.strokeDashoffset = c * (1 - p); label.textContent = `${Math.round(p * 100)}%`; } };
}

/** Klein menu naast een knop. items: [{ label, icon, onClick, danger, disabled } | "sep"] */
let openedMenu = null;
export function openMenu(anchor, items) {
  openedMenu?.();
  const close = (refocus) => {
    if (openedMenu !== close) return;
    openedMenu = null;
    menu.remove();
    document.removeEventListener("pointerdown", onDown, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("scroll", close, true);
    window.removeEventListener("resize", close);
    if (refocus === true) anchor.focus?.();
  };
  const menu = h("div", { class: "menu st-menu", role: "menu" }, items.map((it) => it === "sep" ? h("div", { class: "menu-sep" }) :
    h("button", { class: `menu-item${it.danger ? " is-danger" : ""}`, role: "menuitem", disabled: !!it.disabled, onClick: () => { close(); it.onClick?.(); } }, it.icon ? icon(it.icon) : null, it.label)));
  const onDown = (e) => { if (!menu.contains(e.target) && !anchor.contains(e.target)) close(); };
  const onKey = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); close(true); }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const els = [...menu.querySelectorAll("button:not([disabled])")];
      const i = els.indexOf(document.activeElement);
      els[(i + (e.key === "ArrowDown" ? 1 : -1) + els.length) % els.length]?.focus();
    }
  };
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  const w = menu.offsetWidth, hh = menu.offsetHeight;
  const left = Math.min(Math.max(8, r.right - w), innerWidth - w - 8);
  let top = r.bottom + 6;
  if (top + hh > innerHeight - 8) top = Math.max(8, r.top - hh - 6);
  Object.assign(menu.style, { position: "fixed", left: `${left}px`, top: `${top}px`, zIndex: 990 });
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("scroll", close, true);
  window.addEventListener("resize", close);
  openedMenu = close;
  menu.querySelector("button:not([disabled])")?.focus();
  return close;
}

/** Titel + bijbehorende bestanden verwijderen (bestanden best-effort). Ververs daarna de catalogus. */
export async function deleteTitleFully(t) {
  const vids = episodesOf(t.id);
  const art = [t.poster_path, t.backdrop_path, ...vids.map((v) => v.thumb_path)].filter(isStoragePath);
  const files = vids.filter((v) => v.source === "storage").map((v) => v.video_path).filter(isStoragePath);
  await api.studio.titles.remove(t.id);
  await Promise.allSettled([art.length && api.studio.removeFiles("artwork", art), files.length && api.studio.removeFiles("videos", files)]);
}

/** Lengte van een video bepalen via de metadata. Geeft seconden of null. */
export function probeDuration(src, timeout = 8000) {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    let done = false;
    const end = (d) => {
      if (done) return;
      done = true; clearTimeout(timer);
      v.removeAttribute("src"); v.load();
      resolve(d);
    };
    const timer = setTimeout(() => end(null), timeout);
    v.onloadedmetadata = () => end(Number.isFinite(v.duration) && v.duration > 0 ? Math.round(v.duration) : null);
    v.onerror = () => end(null);
    v.src = src;
  });
}

/* --- De schil ------------------------------------------------------------------ */

export function createStudioLayout(root) {
  const scope = new Scope();
  const main = h("main", { class: "st-main", id: "main" });

  const linkEls = NAV.map((n) => {
    const badge = n.badge ? h("span", { class: "st-count", hidden: true, "aria-label": "wachtend" }) : null;
    if (badge) pendingEls.push(badge);
    return h("a", { class: "st-link", href: `#${n.path}`, dataset: { match: n.match.join(",") } },
      icon(n.icon), h("span", { class: "st-link-l" }, n.label), h("span", { class: "st-link-s" }, n.short), badge);
  });
  const indicator = h("span", { class: "st-ind", "aria-hidden": "true" });
  const nav = h("nav", { class: "st-nav", "aria-label": "Studio" }, indicator, linkEls);

  const goPlatform = () => navigate(session.profile ? "/browse" : "/profiles");
  const m = session.member || {};
  const name = m.display_name || m.email || "Beheerder";

  const side = h("aside", { class: "st-side" },
    h("a", { class: "st-brand", href: "#/studio", "aria-label": "Hoeven+ Studio" },
      h("img", { src: "assets/img/logo.png", alt: "Hoeven+" }), h("span", { class: "st-brand-tag" }, "Studio")),
    nav,
    h("div", { class: "st-side-foot" },
      h("button", { class: "btn btn-outline btn-sm st-platform", onClick: goPlatform }, icon("arrow-left"), "Naar Hoeven+"),
      h("div", { class: "st-user" },
        h("span", { class: "st-user-av", "aria-hidden": "true" }, name[0].toUpperCase()),
        h("span", { class: "st-user-t" }, h("b", { class: "truncate" }, name), h("small", { class: "truncate" }, m.email || "")))),
  );

  const titleEl = h("h1", { class: "st-title" }, "Studio");
  const top = h("header", { class: "st-top" },
    h("a", { class: "st-top-logo", href: "#/studio", "aria-label": "Studio" }, h("img", { src: "assets/img/logo.png", alt: "Hoeven+" })),
    titleEl,
    api.mode === "demo" ? h("span", { class: "st-demo", title: "Alle gegevens staan alleen in deze browser" }, h("i"), h("span", null, "Demo-modus")) : null,
    h("span", { class: "st-top-spacer" }),
    h("button", { class: "icon-btn st-top-home", "aria-label": "Naar Hoeven+", title: "Naar Hoeven+", onClick: goPlatform }, icon("home")),
    h("a", { class: "btn btn-gradient btn-sm st-new", href: "#/studio/content/new" }, icon("plus"), h("span", null, "Nieuwe titel")),
  );

  const shell = h("div", { class: "st-shell" }, side, h("div", { class: "st-body" }, top, main));
  root.appendChild(shell);

  /* Glijdende indicator onder het actieve item */
  function place() {
    const a = linkEls.find((el) => el.classList.contains("is-active"));
    if (!a) { indicator.style.opacity = 0; return; }
    indicator.style.cssText = `opacity:1;width:${a.offsetWidth}px;height:${a.offsetHeight}px;transform:translate(${a.offsetLeft}px,${a.offsetTop}px)`;
    requestAnimationFrame(() => indicator.classList.add("is-ready"));
  }
  scope.on(window, "resize", place);
  document.fonts?.ready.then(place);

  // Aantal wachtende leden voor het bolletje bij Leden
  api.studio.members.list().then((l) => setPending(l.filter((x) => !x.approved).length)).catch(() => {});

  function update(ctx) {
    const name = ctx?.route?.name;
    linkEls.forEach((el) => {
      const on = el.dataset.match.split(",").includes(name);
      el.classList.toggle("is-active", on);
      if (on) el.setAttribute("aria-current", "page"); else el.removeAttribute("aria-current");
    });
    titleEl.textContent = TITLES[name] || "Studio";
    shell.dataset.route = name || "";
    place();
    setPending(pendingCount);
  }

  return {
    main,
    update,
    destroy() { scope.dispose(); pendingEls = []; },
  };
}
