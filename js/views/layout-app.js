/* De schil rond de kijkerschermen: navigatiebalk, mobiele tabbalk, profielmenu, mededeling. */

import { h, Scope, sleep } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { avatar } from "../ui/avatar.js";
import { openModal } from "../ui/modal.js";
import { toast } from "../ui/toast.js";
import { profileTransition } from "../ui/transition.js";
import { session, isAdmin, signOut, activateProfile, leaveProfile } from "../core/session.js";
import { api } from "../api/index.js";
import { navigate, currentPath, parseHash } from "../core/router.js";
import { setQuery, search, searchBus } from "../core/search-bus.js";
import { reloadRoute } from "../core/router.js";

const LINKS = [
  { path: "/browse", label: "Home", icon: "home", match: ["browse"] },
  { path: "/series", label: "Series", icon: "tv", match: ["series"] },
  { path: "/movies", label: "Films", icon: "film", match: ["movies"] },
  { path: "/mylist", label: "Mijn lijst", icon: "bookmark", match: ["mylist"] },
];

export async function switchProfile(profile) {
  const t = profileTransition(profile, { text: "Kijken als" });
  await t.covered;
  await activateProfile(profile);
  if (currentPath() === "/browse") reloadRoute(); else navigate("/browse");
  await t.finish();
}

export function openAccountModal() {
  const m = session.member;
  const pw = h("input", { class: "input", type: "password", placeholder: "Nieuw wachtwoord (min. 6 tekens)", autocomplete: "new-password" });
  const save = h("button", { class: "btn btn-outline btn-sm", onClick: async () => {
    if (pw.value.length < 6) { toast("Kies minimaal 6 tekens.", "error"); return; }
    save.classList.add("is-loading");
    try { await api.auth.updatePassword(pw.value); pw.value = ""; toast("Wachtwoord gewijzigd.", "ok"); }
    catch (e) { toast(e.message, "error"); }
    save.classList.remove("is-loading");
  } }, "Wachtwoord wijzigen");

  const modal = openModal({
    title: "Account",
    body: [
      h("div", { class: "account-head" },
        h("div", { class: "account-badge" }, (m.display_name || m.email)[0].toUpperCase()),
        h("div", null, h("div", { style: { fontWeight: 600 } }, m.display_name || "Lid"), h("div", { class: "muted", style: { fontSize: "14px" } }, m.email)),
        m.role === "admin" ? h("span", { class: "badge ok", style: { marginLeft: "auto" } }, "Beheerder") : null),
      h("div", { class: "field" }, h("label", null, "Wachtwoord"), pw, h("div", null, save)),
      api.mode === "demo" ? h("p", { class: "hint faint" }, "Demo-modus: alle gegevens staan alleen in deze browser.") : null,
    ],
    footer: [
      h("button", { class: "btn btn-outline", onClick: () => modal.close() }, "Sluiten"),
      h("button", { class: "btn btn-danger", onClick: async () => { modal.close(); await logout(); } }, icon("log-out"), "Uitloggen"),
    ],
  });
}

export async function logout() {
  await signOut();
  navigate("/login");
  toast("Tot snel!", "info");
}

export async function createAppLayout(root) {
  const scope = new Scope();
  const main = h("main", { class: "app-main", id: "main" });

  /* --- Navigatie -------------------------------------------------------- */
  const linkEls = LINKS.map((l) => h("a", { class: "nav-link", href: `#${l.path}`, dataset: { match: l.match.join(",") } }, l.label));
  const searchInput = h("input", { class: "nav-search-input", type: "search", placeholder: "Titels, genres", "aria-label": "Zoeken", autocomplete: "off", spellcheck: false });
  const searchBox = h("div", { class: "nav-search" },
    h("button", { class: "nav-search-btn", "aria-label": "Zoeken", onClick: () => {
      if (window.matchMedia("(max-width: 760px)").matches) { navigate("/search"); return; }
      searchBox.classList.add("is-open"); searchInput.focus();
    } }, icon("search")),
    searchInput,
  );

  const profileBtn = h("button", { class: "nav-profile", "aria-haspopup": "menu", "aria-label": "Profielmenu" });
  const nav = h("header", { class: "nav" },
    h("a", { class: "nav-logo", href: "#/browse", "aria-label": "Hoeven+ startpagina" }, h("img", { src: "assets/img/logo.png", alt: "Hoeven+" })),
    h("nav", { class: "nav-links", "aria-label": "Hoofdmenu" }, linkEls),
    h("div", { class: "nav-right" }, searchBox, profileBtn),
  );

  /* --- Mobiele tabbalk ----------------------------------------------------- */
  const tabDefs = [
    { path: "/browse", label: "Home", icon: "home", match: ["browse"] },
    { path: "/search", label: "Zoeken", icon: "search", match: ["search"] },
    { path: "/series", label: "Series", icon: "tv", match: ["series"] },
    { path: "/movies", label: "Films", icon: "film", match: ["movies"] },
    { path: "/mylist", label: "Lijst", icon: "bookmark", match: ["mylist"] },
  ];
  const tabEls = tabDefs.map((t) => h("a", { class: "tab", href: `#${t.path}`, dataset: { match: t.match.join(",") } }, icon(t.icon), h("span", null, t.label)));
  const tabbar = h("nav", { class: "tabbar", "aria-label": "Mobiel menu" }, tabEls);

  root.append(nav, main, tabbar);

  /* --- Scroll-effect --------------------------------------------------------- */
  const onScroll = () => nav.classList.toggle("is-solid", window.scrollY > 24);
  scope.on(window, "scroll", onScroll, { passive: true });
  onScroll();

  /* --- Zoeken ------------------------------------------------------------------ */
  const collapse = () => { if (!searchInput.value) searchBox.classList.remove("is-open"); };
  scope.on(searchInput, "input", () => {
    const q = searchInput.value;
    setQuery(q, "nav");
    const url = `/search?q=${encodeURIComponent(q)}`;
    if (currentPath() === "/search") history.replaceState(history.state, "", `#${url}`);
    else if (q) navigate(url);
  });
  scope.on(searchInput, "blur", collapse);
  scope.on(searchInput, "keydown", (e) => { if (e.key === "Escape") { searchInput.value = ""; setQuery("", "nav"); searchInput.blur(); collapse(); } });
  scope.on(searchBus, "query", (e) => { if (e.detail.source !== "nav") searchInput.value = e.detail.q; });

  /* --- Profielmenu --------------------------------------------------------------- */
  let menu = null;
  function closeMenu() { menu?.remove(); menu = null; profileBtn.classList.remove("is-open"); }
  function renderProfileBtn() {
    const p = session.profile;
    profileBtn.replaceChildren(p ? avatar(p, { size: 34 }) : h("span"), icon("chevron-down", { cls: "nav-caret" }));
  }
  function openMenu() {
    closeMenu();
    const others = session.profiles.filter((p) => p.id !== session.profile?.id);
    menu = h("div", { class: "menu nav-menu", role: "menu" },
      others.length ? h("div", { class: "menu-label" }, "Profiel wisselen") : null,
      others.map((p) => h("button", { class: "menu-item", role: "menuitem", onClick: () => { closeMenu(); switchProfile(p); } }, avatar(p, { size: 30 }), p.name, p.is_kids ? h("span", { class: "badge", style: { marginLeft: "auto" } }, "Kids") : null)),
      others.length ? h("div", { class: "menu-sep" }) : null,
      h("button", { class: "menu-item", role: "menuitem", onClick: () => { closeMenu(); navigate("/profiles/manage"); } }, icon("pencil"), "Profielen beheren"),
      isAdmin() ? h("button", { class: "menu-item", role: "menuitem", onClick: () => { closeMenu(); navigate("/studio"); } }, icon("sliders"), "Hoeven+ Studio") : null,
      h("button", { class: "menu-item", role: "menuitem", onClick: () => { closeMenu(); openAccountModal(); } }, icon("user"), "Account"),
      h("div", { class: "menu-sep" }),
      h("button", { class: "menu-item", role: "menuitem", onClick: () => { closeMenu(); logout(); } }, icon("log-out"), "Uitloggen"),
    );
    profileBtn.classList.add("is-open");
    nav.querySelector(".nav-right").appendChild(menu);
  }
  scope.on(profileBtn, "click", (e) => { e.stopPropagation(); menu ? closeMenu() : openMenu(); });
  scope.on(document, "click", (e) => { if (menu && !menu.contains(e.target)) closeMenu(); });
  scope.on(document, "keydown", (e) => { if (e.key === "Escape") closeMenu(); });
  renderProfileBtn();

  /* --- Mededeling ------------------------------------------------------------------- */
  let pill = null;
  function showAnnouncement() {
    pill?.remove(); pill = null;
    const a = session.settings?.announcement;
    if (!a?.enabled || !a.text) return;
    const key = `hp:ann:${a.text}`;
    try { if (sessionStorage.getItem(key)) return; } catch { /* */ }
    pill = h("div", { class: "announce-pill", role: "status" },
      icon("megaphone"), h("span", null, a.text),
      h("button", { "aria-label": "Sluiten", onClick: () => { try { sessionStorage.setItem(key, "1"); } catch { /* */ } pill.classList.add("is-leaving"); setTimeout(() => pill?.remove(), 400); } }, icon("x")));
    document.body.appendChild(pill);
    scope.add(() => pill?.remove());
  }
  setTimeout(showAnnouncement, 1200);

  function setActive(ctx) {
    const name = ctx?.route?.name;
    for (const el of [...linkEls, ...tabEls]) el.classList.toggle("is-active", el.dataset.match.split(",").includes(name));
    if (name !== "search" && searchInput.value) { searchInput.value = ""; search.q = ""; collapse(); }
    renderProfileBtn();
  }

  return {
    main,
    update: setActive,
    destroy() { scope.dispose(); closeMenu(); },
  };
}
