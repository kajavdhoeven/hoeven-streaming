/* ==========================================================================
   Router op basis van #-adressen (werkt overal op Cloudflare Pages, zonder
   server-instellingen). Ondersteunt lagen (layouts) en overlay-routes zoals
   de titel-pagina die over de startpagina heen opent.
   ========================================================================== */

import { h, clear } from "../ui/dom.js";
import { loader } from "../ui/loader.js";

const routes = [];
const layouts = {};
let beforeEach = () => null;

let rootEl = null;
let overlayEl = null;
let current = null;      // { route, ctx, cleanup }
let currentLayout = null; // { name, instance }
let overlay = null;      // { route, ctx, cleanup, el }
let token = 0;
let idx = 0;          // positie in onze eigen geschiedenis (voor 'terug')
let replacing = false;
let lastBaseHash = null;

export function defineLayout(name, factory) { layouts[name] = factory; }
export function defineRoutes(list) {
  for (const r of list) {
    const keys = [];
    const regex = new RegExp("^" + r.path.replace(/:([a-z]+)/gi, (_, k) => { keys.push(k); return "([^/]+)"; }) + "/?$");
    routes.push({ ...r, regex, keys });
  }
}
export function setGuard(fn) { beforeEach = fn; }

export function parseHash() {
  const raw = location.hash.startsWith("#/") ? location.hash.slice(1) : "/";
  const [path, qs = ""] = raw.split("?");
  return { path: path || "/", query: Object.fromEntries(new URLSearchParams(qs)) };
}

function match(path) {
  for (const r of routes) {
    const m = r.regex.exec(path);
    if (m) return { route: r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

export function navigate(path, { replace = false } = {}) {
  const target = `#${path}`;
  if (location.hash === target) { handle(); return; }
  if (replace) { replacing = true; location.replace(target); }
  else location.hash = path;
}

/** Terug in de app-geschiedenis, of naar een vaste plek als er niets is om naar terug te gaan. */
export function back(fallback = "/browse") {
  if (idx > 0) history.back();
  else navigate(fallback, { replace: true });
}

export const currentPath = () => parseHash().path;

/** Het huidige scherm opnieuw opbouwen (bijv. na het wisselen van profiel). */
export function reloadRoute() { lastBaseHash = null; handle(); }

export function startRouter(root, overlayRoot) {
  rootEl = root;
  overlayEl = overlayRoot;
  idx = history.state && typeof history.state.idx === "number" ? history.state.idx : 0;
  history.replaceState({ idx }, "");
  window.addEventListener("hashchange", () => {
    const s = history.state;
    if (s && typeof s.idx === "number") idx = s.idx;             // terug/vooruit
    else { if (!replacing) idx += 1; history.replaceState({ idx }, ""); } // nieuwe pagina
    replacing = false;
    handle();
  });
  handle();
}

async function destroyOverlay() {
  if (!overlay) return;
  const o = overlay;
  overlay = null;
  try { await o.cleanup?.(); } catch (e) { console.error(e); }
  o.el.remove();
  document.body.classList.remove("has-overlay");
}

async function destroyCurrent() {
  if (!current) return;
  const c = current;
  current = null;
  try { await c.cleanup?.(); } catch (e) { console.error(e); }
}

function errorView(container, err, retry) {
  clear(container).appendChild(
    h("div", { class: "empty view-enter", style: { minHeight: "60vh", alignContent: "center" } },
      h("div", { class: "empty-icon" }, "😕"),
      h("h3", null, "Er ging iets mis"),
      h("p", null, err?.message || "Onbekende fout."),
      h("button", { class: "btn btn-primary", onClick: retry }, "Opnieuw proberen"),
    ),
  );
}

async function ensureLayout(name) {
  if (currentLayout?.name === name) return currentLayout.instance;
  currentLayout?.instance.destroy?.();
  clear(rootEl);
  const factory = layouts[name] || layouts.bare;
  const instance = await factory(rootEl);
  currentLayout = { name, instance };
  return instance;
}

async function handle() {
  const my = ++token;
  const { path, query } = parseHash();
  let found = match(path);
  if (!found) { navigate("/browse", { replace: true }); return; }

  const redirect = await beforeEach(found.route, { path, query, params: found.params });
  if (my !== token) return;
  if (redirect && redirect !== path) { navigate(redirect, { replace: true }); return; }

  const ctx = { path, query, params: found.params, route: found.route };

  /* ---- Overlay-route (bijv. titelpagina) ---- */
  if (found.route.overlay) {
    if (!current) {
      // Direct binnengekomen op de overlay: eerst de startpagina eronder zetten.
      const baseRoute = match("/browse");
      await mountBase(baseRoute.route, { path: "/browse", query: {}, params: {}, route: baseRoute.route }, my, { animate: false });
      if (my !== token) return;
    }
    await destroyOverlay();
    const el = h("div", { class: "overlay-layer" });
    overlayEl.appendChild(el);
    overlay = { route: found.route, ctx, el, cleanup: null };
    document.body.classList.add("has-overlay");
    try {
      const mod = await found.route.view();
      if (my !== token) { el.remove(); overlay = null; return; }
      overlay.cleanup = await (mod.default || mod).mount(el, ctx);
    } catch (e) { console.error(e); errorView(el, e, () => handle()); }
    return;
  }

  /* ---- Gewone route ---- */
  await destroyOverlay();
  await mountBase(found.route, ctx, my);
}

async function mountBase(route, ctx, my, { animate = true } = {}) {
  const sameRoute = current && current.route === route && lastBaseHash === location.hash;
  if (sameRoute) return;
  await destroyCurrent();
  if (my !== token) return;

  const layout = await ensureLayout(route.layout || "bare");
  layout.update?.(ctx);
  const main = layout.main;
  clear(main);
  const holder = h("div", { class: `route-holder${animate ? " view-enter" : ""}`, dataset: { route: route.name || route.path } });
  main.appendChild(holder);
  holder.appendChild(h("div", { class: "view-loading", style: { minHeight: route.layout === "app" ? "60vh" : "100dvh", background: "transparent" } }, loader({ bar: false })));
  current = { route, ctx, cleanup: null };
  lastBaseHash = location.hash;
  window.scrollTo(0, 0);

  try {
    const mod = await route.view();
    if (my !== token) return;
    clear(holder);
    const cleanup = await (mod.default || mod).mount(holder, ctx);
    if (my !== token) { try { await cleanup?.(); } catch { /* */ } return; }
    current.cleanup = cleanup;
  } catch (e) {
    console.error(e);
    if (my === token) errorView(holder, e, () => { lastBaseHash = null; handle(); });
  }
}
