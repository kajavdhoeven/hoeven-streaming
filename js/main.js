/* ==========================================================================
   Hoeven+  -  opstarten
   ========================================================================== */

import { initApi, hasSupabaseConfig, api } from "./api/index.js";
import { defineLayout, defineRoutes, setGuard, startRouter, navigate } from "./core/router.js";
import { bootSession, session, resetLocal } from "./core/session.js";
import { playSplash } from "./views/splash.js";
import { h } from "./ui/dom.js";
import { toast } from "./ui/toast.js";

/* Lagen (layouts): een vaste schil rondom de schermen */
defineLayout("bare", async (root) => {
  const main = h("div", { class: "layout-bare" });
  root.appendChild(main);
  return { main };
});
defineLayout("player", async (root) => {
  const main = h("div", { class: "layout-player" });
  root.appendChild(main);
  return { main };
});
defineLayout("app", async (root) => (await import("./views/layout-app.js")).createAppLayout(root));
defineLayout("studio", async (root) => (await import("./views/studio/layout.js")).createStudioLayout(root));

/* Routes. profile:false = geen profiel nodig, admin:true = alleen beheerders */
defineRoutes([
  { path: "/login", name: "login", layout: "bare", profile: false, view: () => import("./views/auth.js") },
  { path: "/reset", name: "reset", layout: "bare", profile: false, view: () => import("./views/auth.js") },
  { path: "/pending", name: "pending", layout: "bare", profile: false, view: () => import("./views/pending.js") },
  { path: "/profiles", name: "profiles", layout: "bare", profile: false, view: () => import("./views/profiles.js") },
  { path: "/profiles/manage", name: "profiles-manage", layout: "bare", profile: false, view: () => import("./views/profiles.js") },

  { path: "/browse", name: "browse", layout: "app", view: () => import("./views/browse.js") },
  { path: "/movies", name: "movies", layout: "app", view: () => import("./views/grid.js") },
  { path: "/series", name: "series", layout: "app", view: () => import("./views/grid.js") },
  { path: "/mylist", name: "mylist", layout: "app", view: () => import("./views/grid.js") },
  { path: "/search", name: "search", layout: "app", view: () => import("./views/search.js") },
  { path: "/title/:id", name: "title", overlay: true, view: () => import("./views/title.js") },
  { path: "/watch/:id", name: "watch", layout: "player", view: () => import("./views/watch.js") },

  { path: "/studio", name: "studio", layout: "studio", profile: false, admin: true, view: () => import("./views/studio/dashboard.js") },
  { path: "/studio/content", name: "studio-content", layout: "studio", profile: false, admin: true, view: () => import("./views/studio/content.js") },
  { path: "/studio/content/new", name: "studio-new", layout: "studio", profile: false, admin: true, view: () => import("./views/studio/editor.js") },
  { path: "/studio/content/:id", name: "studio-edit", layout: "studio", profile: false, admin: true, view: () => import("./views/studio/editor.js") },
  { path: "/studio/rows", name: "studio-rows", layout: "studio", profile: false, admin: true, view: () => import("./views/studio/rows.js") },
  { path: "/studio/members", name: "studio-members", layout: "studio", profile: false, admin: true, view: () => import("./views/studio/members.js") },
  { path: "/studio/settings", name: "studio-settings", layout: "studio", profile: false, admin: true, view: () => import("./views/studio/settings.js") },
]);

/* Toegangsregels: inloggen -> goedgekeurd -> profiel gekozen */
setGuard((route) => {
  const m = session.member;
  const name = route.name;
  if (!m) return name === "login" || name === "reset" ? null : "/login";
  if (name === "reset") return null;
  if (!m.approved) return name === "pending" ? null : "/pending";
  if (name === "login" || name === "pending") return session.profile ? "/browse" : "/profiles";
  if (route.admin && m.role !== "admin") return "/browse";
  if (route.profile !== false && !session.profile) return "/profiles";
  return null;
});

function fatal(err) {
  console.error(err);
  document.getElementById("app").replaceChildren(
    h("div", { class: "empty", style: { minHeight: "100dvh", alignContent: "center" } },
      h("div", { class: "empty-icon" }, "⚠️"),
      h("h3", null, "Hoeven+ kan niet starten"),
      h("p", null, err?.message || "Onbekende fout."),
      h("button", { class: "btn btn-primary", onClick: () => location.reload() }, "Opnieuw proberen"),
    ),
  );
}

async function boot() {
  const firstVisit = (() => { try { return !sessionStorage.getItem("hp:splash"); } catch { return true; } })();
  try { sessionStorage.setItem("hp:splash", "1"); } catch { /* */ }

  const splash = playSplash({ short: !firstVisit });
  try {
    await initApi();
    await bootSession();
  } catch (e) {
    await splash.finish();
    return fatal(e);
  }

  // Reageren op uitloggen elders en op wachtwoord-herstel via e-mail
  api.auth.onEvent((event) => {
    if (event === "PASSWORD_RECOVERY") navigate("/reset");
    if (event === "SIGNED_OUT" && session.member) { resetLocal(); navigate("/login"); toast("Je bent uitgelogd.", "info"); }
  });

  await splash.finish();
  startRouter(document.getElementById("app"), document.getElementById("overlay-root"));
  if (!hasSupabaseConfig()) console.info("Hoeven+ draait in demo-modus. Vul js/config.js in om Supabase te gebruiken.");
}

boot();
