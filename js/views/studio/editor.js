/* Studio > Titel bewerken of nieuw: formulier, afbeeldingen, live voorvertoning en video's. */

import { h, Scope, mount } from "../../ui/dom.js";
import { icon } from "../../ui/icons.js";
import { toast } from "../../ui/toast.js";
import { openModal, confirmDialog } from "../../ui/modal.js";
import { fmtDuration, fmtBytes, kindLabel, GENRES, RATINGS, KIDS_RATINGS, ratingLabel } from "../../ui/format.js";
import { navigate, back } from "../../core/router.js";
import { session } from "../../core/session.js";
import { api } from "../../api/index.js";
import { cat, loadCatalog, episodesOf, posterUrl, backdropUrl, thumbUrl } from "../../data/catalog.js";
import { progressRing, isStoragePath, emptyState, deleteTitleFully, probeDuration, ratingBadge } from "./layout.js";
import { parseYouTubeId, youTubeIdFromUrl, youTubeThumb } from "../../ui/youtube.js";

const MAX_IMG = 10 * 1024 * 1024;
const FREE_LIMIT = 50 * 1024 * 1024;

const STATUS_INFO = {
  draft: "Alleen jij ziet deze titel in de Studio. Kijkers zien hem nog niet.",
  published: "Kijkers zien deze titel direct op het platform.",
  coming_soon: "Kijkers zien de titel bij 'Binnenkort'. Op het gekozen moment wordt hij automatisch kijkbaar.",
};

/* datetime-local <-> ISO */
const pad = (n) => String(n).padStart(2, "0");
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);
const intOrNull = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };

let fieldSeq = 0;
function field(label, control, hint) {
  const id = `st-f${++fieldSeq}`;
  control.id = id;
  return h("div", { class: "field" }, h("label", { for: id }, label), control, hint ? h("div", { class: "hint" }, hint) : null);
}

/**
 * Afbeelding-veld met slepen en klikken. get/set lezen en schrijven de waarde,
 * discard(oudPad) wordt aangeroepen als een bestand vervangen of verwijderd wordt.
 */
function imageField({ label, hint, ratio, folder, get, set, discard }) {
  const input = h("input", { type: "file", accept: "image/*", hidden: true, tabIndex: -1 });
  const ring = progressRing({ size: 64, stroke: 6 });
  const box = h("div", { class: `st-drop r-${ratio}`, role: "button", tabIndex: 0, "aria-label": `${label} kiezen` });
  const actions = h("div", { class: "st-drop-acts" });
  let local = null;
  let busy = false;

  function paint() {
    const src = local || api.media.artwork(get());
    box.classList.toggle("has-img", !!src);
    box.classList.toggle("is-busy", busy);
    mount(box,
      src ? h("img", { src, alt: `Voorbeeld van ${label.toLowerCase()}`, draggable: false }) : h("div", { class: "st-drop-empty" }, icon("upload"), h("b", null, "Sleep een afbeelding hierheen"), h("span", null, "of klik om te kiezen")),
      busy ? h("div", { class: "st-drop-busy" }, ring.el) : null,
    );
    actions.replaceChildren(...(get() && !busy ? [
      h("button", { class: "btn btn-outline btn-sm", type: "button", onClick: () => input.click() }, icon("refresh"), "Vervangen"),
      h("button", { class: "btn btn-danger btn-sm", type: "button", onClick: () => { discard(get()); set(null); paint(); } }, icon("trash"), "Verwijderen"),
    ] : []));
  }

  async function take(file) {
    if (!file || busy) return;
    if (!file.type.startsWith("image/")) { toast("Kies een afbeelding (JPG, PNG of WebP).", "error"); return; }
    if (file.size > MAX_IMG) { toast(`Deze afbeelding is ${fmtBytes(file.size)}. De limiet is 10 MB.`, "error"); return; }
    local = URL.createObjectURL(file);
    busy = true; ring.set(0); paint();
    try {
      const { path } = await api.studio.upload("artwork", file, { folder, onProgress: (p) => ring.set(p) });
      const old = get();
      set(path);
      if (old && old !== path) discard(old);
    } catch (e) { toast(e.message, "error"); }
    URL.revokeObjectURL(local); local = null; busy = false;
    paint();
  }

  box.addEventListener("click", () => { if (!busy) input.click(); });
  box.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && !busy) { e.preventDefault(); input.click(); } });
  input.addEventListener("change", () => { take(input.files[0]); input.value = ""; });
  ["dragenter", "dragover"].forEach((ev) => box.addEventListener(ev, (e) => { e.preventDefault(); box.classList.add("is-over"); }));
  ["dragleave", "drop"].forEach((ev) => box.addEventListener(ev, () => box.classList.remove("is-over")));
  box.addEventListener("drop", (e) => { e.preventDefault(); take(e.dataTransfer.files[0]); });
  paint();
  return { el: h("div", { class: "st-imgf" }, h("div", { class: "label" }, label), box, actions, input, hint ? h("div", { class: "hint" }, hint) : null), paint };
}

export default {
  async mount(root, ctx) {
    const scope = new Scope();
    let alive = true;
    scope.add(() => { alive = false; });
    const page = h("div", { class: "st-page st-editor-page" });
    root.appendChild(page);

    let titleId = ctx.params.id || null;
    try { await loadCatalog(true); } catch (e) { toast(e.message, "error"); }
    if (!alive) return;
    const existing = titleId ? cat.byId.get(titleId) : null;
    if (titleId && !existing) {
      page.appendChild(emptyState({ emoji: "🔍", title: "Titel niet gevonden", text: "Deze titel bestaat niet (meer). Misschien is hij verwijderd.",
        action: h("a", { class: "btn btn-primary", href: "#/studio/content" }, "Naar content") }));
      return () => scope.dispose();
    }

    /* --- Toestand ------------------------------------------------------------------- */
    const form = {
      kind: existing?.kind || "movie",
      title: existing?.title || "",
      tagline: existing?.tagline || "",
      description: existing?.description || "",
      year: existing ? existing.year : new Date().getFullYear(),
      genres: [...(existing?.genres || [])],
      rating: existing?.rating || "AL",
      poster_path: existing?.poster_path || null,
      backdrop_path: existing?.backdrop_path || null,
      status: existing?.status || "draft",
      release_at: existing?.release_at || null,
      featured: !!existing?.featured,
      show_on_landing: !!existing?.show_on_landing,
    };
    const snap = () => JSON.stringify(form);
    let savedSnap = snap();
    const savedFiles = { poster_path: form.poster_path, backdrop_path: form.backdrop_path };
    const trash = new Set(); // bewaarde bestanden die pas na opslaan weg mogen
    let videos = titleId ? [...episodesOf(titleId)] : [];
    let leaving = false;
    let saving = false;
    let activeModal = null; // openstaand video-venster, wordt gesloten als je het scherm verlaat
    let activeCtrl = null;
    const extraGenres = new Set(form.genres.filter((g) => !GENRES.includes(g)));
    const isDirty = () => !leaving && snap() !== savedSnap;

    const discardArtwork = (key) => (path) => {
      if (!isStoragePath(path)) return;
      if (path === savedFiles[key]) trash.add(path);
      else api.studio.removeFiles("artwork", [path]).catch(() => {});
    };

    /* --- Actiebalk ---------------------------------------------------------------------- */
    const barTitle = h("h2", { class: "truncate" });
    const barSub = h("small", { class: "truncate" });
    const dirtyEl = h("span", { class: "st-dirty", role: "status", hidden: true }, h("i"), h("span", null, "Niet-opgeslagen wijzigingen"));
    const saveBtn = h("button", { class: "btn btn-outline btn-sm", type: "button", onClick: () => save() }, icon("check"), "Opslaan");
    const pubBtn = h("button", { class: "btn btn-gradient btn-sm", type: "button", onClick: () => save({ publish: true }) }, icon("play"), h("span", { class: "st-lg" }, "Opslaan en publiceren"), h("span", { class: "st-sm" }, "Publiceren"));
    const backBtn = h("button", { class: "btn btn-outline btn-sm btn-back", type: "button", onClick: () => goBack() }, icon("arrow-left"), h("span", null, "Terug"));
    const bar = h("div", { class: "st-editbar" }, backBtn, h("div", { class: "st-editbar-t" }, barTitle, barSub), dirtyEl, h("span", { class: "st-top-spacer" }), saveBtn, pubBtn);

    async function confirmLeave() {
      if (!isDirty()) return true;
      return confirmDialog({ title: "Wijzigingen weggooien?", message: "Je hebt niet-opgeslagen wijzigingen. Als je nu weggaat, zijn ze verloren.", confirmText: "Weggooien", cancelText: "Blijven bewerken", danger: true });
    }
    async function goBack() {
      if (!await confirmLeave()) return;
      leaving = true;
      back("/studio/content");
    }

    /* --- Formulier: basis ------------------------------------------------------------------ */
    const bind = (el, key, fn = (v) => v) => { scope.on(el, "input", () => { form[key] = fn(el.value); changed(); }); return el; };

    const kindSeg = h("div", { class: "seg", role: "radiogroup", "aria-label": "Type" }, ["movie", "series"].map((k) =>
      h("button", { type: "button", role: "radio", class: form.kind === k ? "is-active" : "", "aria-checked": form.kind === k, dataset: { v: k }, onClick: () => { form.kind = k; syncSegs(); renderVideos(); changed(); } }, icon(k === "series" ? "tv" : "film"), " ", kindLabel(k))));

    const titleIn = bind(h("input", { class: "input", type: "text", maxLength: 120, placeholder: "Bijvoorbeeld: Zomer in Zeeland", value: form.title, autocomplete: "off" }), "title");
    const taglineIn = bind(h("input", { class: "input", type: "text", maxLength: 120, placeholder: "Een korte, pakkende zin", value: form.tagline }), "tagline");
    const descIn = bind(h("textarea", { class: "textarea", maxLength: 1200, placeholder: "Waar gaat het over? Dit lees je op de titelpagina.", value: form.description }), "description");
    const yearIn = bind(h("input", { class: "input", type: "number", min: 1900, max: 2100, inputMode: "numeric", value: form.year ?? "" }), "year", intOrNull);
    scope.on(titleIn, "input", () => titleIn.classList.remove("is-error"));

    const basics = h("section", { class: "st-card st-ed-card" },
      h("h3", null, "Basis"),
      h("div", { class: "field" }, h("span", { class: "label" }, "Type"), kindSeg),
      field("Titel", titleIn), field("Tagline", taglineIn, "Verschijnt onder de titel op de startpagina."),
      field("Beschrijving", descIn), h("div", { class: "field-row" }, field("Jaar", yearIn)));

    /* --- Genres ------------------------------------------------------------------------------ */
    const genreWrap = h("div", { class: "chips" });
    const genreIn = h("input", { class: "input", type: "text", maxLength: 24, placeholder: "Eigen genre", "aria-label": "Eigen genre toevoegen", autocomplete: "off" });
    function paintGenres() {
      genreWrap.replaceChildren(...[...GENRES, ...extraGenres].map((g) => {
        const on = form.genres.includes(g);
        return h("button", { type: "button", class: `chip${on ? " is-active" : ""}`, "aria-pressed": on, onClick: () => {
          form.genres = on ? form.genres.filter((x) => x !== g) : [...form.genres, g];
          paintGenres(); changed();
        } }, on ? icon("check") : null, g);
      }));
    }
    function addGenre() {
      const g = genreIn.value.trim().replace(/\s+/g, " ");
      if (!g) return;
      const known = [...GENRES, ...extraGenres].find((x) => x.toLowerCase() === g.toLowerCase());
      const name = known || g[0].toUpperCase() + g.slice(1);
      if (!known) extraGenres.add(name);
      if (!form.genres.includes(name)) form.genres = [...form.genres, name];
      genreIn.value = "";
      paintGenres(); changed();
    }
    scope.on(genreIn, "keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addGenre(); } });
    const genres = h("section", { class: "st-card st-ed-card" }, h("h3", null, "Genres"), genreWrap,
      h("div", { class: "st-inline" }, genreIn, h("button", { type: "button", class: "btn btn-outline", onClick: addGenre }, icon("plus"), "Toevoegen")));

    /* --- Kijkwijzer ----------------------------------------------------------------------------- */
    const ratingNote = h("p", { class: "st-note" });
    const ratingBtns = h("div", { class: "st-ratings", role: "radiogroup", "aria-label": "Kijkwijzer" }, RATINGS.map((r) =>
      h("button", { type: "button", role: "radio", class: "st-rate", dataset: { v: r }, onClick: () => { form.rating = r; syncSegs(); changed(); } }, ratingBadge(r), h("span", null, ratingLabel(r)))));
    const rating = h("section", { class: "st-card st-ed-card" }, h("h3", null, "Kijkwijzer"),
      h("p", { class: "muted" }, "Voor welke leeftijd is dit geschikt?"), ratingBtns, ratingNote);

    /* --- Status ------------------------------------------------------------------------------------ */
    const statusSeg = h("div", { class: "seg", role: "radiogroup", "aria-label": "Status" }, [["draft", "Concept"], ["published", "Gepubliceerd"], ["coming_soon", "Binnenkort"]].map(([v, l]) =>
      h("button", { type: "button", role: "radio", dataset: { v }, onClick: () => { form.status = v; if (v === "coming_soon" && !form.release_at) { form.release_at = new Date(Date.now() + 7 * 864e5).toISOString(); releaseIn.value = toLocalInput(form.release_at); } syncSegs(); changed(); } }, l)));
    const statusNote = h("p", { class: "st-note" });
    const releaseIn = h("input", { class: "input", type: "datetime-local", value: toLocalInput(form.release_at) });
    scope.on(releaseIn, "input", () => { form.release_at = fromLocalInput(releaseIn.value); changed(); });
    const releaseField = h("div", { class: "st-release" }, field("Beschikbaar vanaf", releaseIn, "Vanaf dit moment wordt de titel automatisch kijkbaar, zonder dat je iets hoeft te doen."));
    const featuredIn = h("input", { type: "checkbox", checked: form.featured });
    scope.on(featuredIn, "change", () => { form.featured = featuredIn.checked; changed(); });
    const landingIn = h("input", { type: "checkbox", checked: form.show_on_landing });
    scope.on(landingIn, "change", () => { form.show_on_landing = landingIn.checked; changed(); });
    const visibility = h("section", { class: "st-card st-ed-card" }, h("h3", null, "Zichtbaarheid"),
      statusSeg, statusNote, releaseField,
      h("label", { class: "switch st-featured" }, featuredIn, h("span", { class: "track" }),
        h("span", null, h("b", null, "Uitgelicht"), h("small", null, "Komt in de grote hero-carrousel bovenaan de startpagina."))),
      h("label", { class: "switch st-featured" }, landingIn, h("span", { class: "track" }),
        h("span", null, h("b", null, "Tonen op de openbare voorpagina"), h("small", null, "Bezoekers zonder account zien de poster en titel. Laat dit uit voor privévideo's."))));

    /* --- Afbeeldingen ------------------------------------------------------------------------------ */
    const posterField = imageField({ label: "Poster", ratio: "poster", folder: "posters", hint: "Staand (2:3), bijvoorbeeld 1000 x 1500. Max 10 MB.",
      get: () => form.poster_path, set: (v) => { form.poster_path = v; changed(); }, discard: discardArtwork("poster_path") });
    const backdropField = imageField({ label: "Achtergrond", ratio: "wide", folder: "backdrops", hint: "Breed (16:9), bijvoorbeeld 1920 x 1080. Max 10 MB.",
      get: () => form.backdrop_path, set: (v) => { form.backdrop_path = v; changed(); }, discard: discardArtwork("backdrop_path") });
    const artwork = h("section", { class: "st-card st-ed-card" }, h("h3", null, "Afbeeldingen"), h("div", { class: "st-art-grid" }, posterField.el, backdropField.el));

    /* --- Video's --------------------------------------------------------------------------------------- */
    const vidBody = h("div", { class: "st-vids" });
    const vidHead = h("div", { class: "st-card-head" });
    const videosCard = h("section", { class: "st-card st-ed-card" }, vidHead, vidBody);

    async function ensureSaved() {
      if (titleId) return true;
      if (!form.title.trim()) {
        toast("Geef je titel eerst een naam. Daarna kun je video's toevoegen.", "info");
        titleIn.classList.add("is-error"); titleIn.focus();
        return false;
      }
      const ok = await save({ silent: true });
      if (ok) toast("Titel opgeslagen. Nu de video!", "ok");
      return ok;
    }

    const sortVideos = () => videos.sort((a, b) => a.season - b.season || a.episode - b.episode);

    function videoRow(v, i) {
      const series = form.kind === "series";
      const thumb = thumbUrl(v, form);
      const meta = [v.duration_seconds ? fmtDuration(v.duration_seconds) : null, v.source === "youtube" ? "YouTube" : v.source === "url" ? "Externe link" : "Geüpload", v.intro_end != null ? "Intro-knop" : null].filter(Boolean);
      const sameSeason = videos.filter((x) => x.season === v.season);
      const pos = sameSeason.indexOf(v);
      return h("li", { class: "st-vrow stagger", style: { "--i": Math.min(i, 8) } },
        series ? h("span", { class: "st-ep" }, `A${v.episode}`) : null,
        h("span", { class: "st-vthumb" }, thumb ? h("img", { src: thumb, alt: "", loading: "lazy" }) : icon("video")),
        h("div", { class: "st-vinfo" }, h("b", { class: "truncate" }, v.name), h("small", { class: "truncate" }, meta.join(" - ") || "Geen duur bekend")),
        h("div", { class: "st-acts" },
          series ? h("button", { class: "st-ib", type: "button", disabled: pos <= 0, "aria-label": "Eerder in het seizoen", title: "Omhoog", onClick: () => moveVideo(v, -1) }, icon("chevron-up")) : null,
          series ? h("button", { class: "st-ib", type: "button", disabled: pos >= sameSeason.length - 1, "aria-label": "Later in het seizoen", title: "Omlaag", onClick: () => moveVideo(v, 1) }, icon("chevron-down")) : null,
          h("button", { class: "st-ib", type: "button", "aria-label": `${v.name} bewerken`, title: "Bewerken", onClick: () => openVideoModal(v) }, icon("pencil")),
          h("button", { class: "st-ib is-danger", type: "button", "aria-label": `${v.name} verwijderen`, title: "Verwijderen", onClick: () => removeVideo(v) }, icon("trash"))));
    }

    function renderVideos() {
      const series = form.kind === "series";
      sortVideos();
      const canAdd = series || videos.length === 0;
      vidHead.replaceChildren(h("h3", null, series ? "Afleveringen" : "Video"),
        h("div", { class: "st-acts" },
          series && videos.length ? h("button", { class: "btn btn-outline btn-sm", type: "button", onClick: () => openVideoModal(null, { season: Math.max(...videos.map((v) => v.season)) + 1 }) }, icon("plus"), "Nieuw seizoen") : null,
          canAdd ? h("button", { class: "btn btn-primary btn-sm", type: "button", onClick: () => openVideoModal(null) }, icon("plus"), series ? "Aflevering toevoegen" : "Video toevoegen") : null));
      const kids = [];
      if (!titleId) kids.push(h("p", { class: "st-note" }, icon("info"), "Video's horen bij een opgeslagen titel. Klik op 'Video toevoegen': dan slaan we de titel eerst voor je op."));
      if (!videos.length) {
        kids.push(h("div", { class: "st-vempty" }, icon("video"), h("b", null, series ? "Nog geen afleveringen" : "Nog geen video"), h("span", null, series ? "Voeg de eerste aflevering toe om te beginnen." : "Voeg de film toe: upload een bestand of plak een link.")));
      } else if (series) {
        const seasons = [...new Set(videos.map((v) => v.season))];
        seasons.forEach((s) => {
          const list = videos.filter((v) => v.season === s);
          kids.push(h("div", { class: "st-season" }, h("h4", null, `Seizoen ${s}`), h("span", { class: "muted" }, list.length === 1 ? "1 aflevering" : `${list.length} afleveringen`)));
          kids.push(h("ul", { class: "st-vlist" }, list.map(videoRow)));
        });
      } else {
        kids.push(h("ul", { class: "st-vlist" }, videos.map(videoRow)));
        if (videos.length > 1) kids.push(h("p", { class: "st-note" }, icon("info"), "Een film heeft één video. Deze titel heeft er meer; verwijder de overige of maak er een serie van."));
      }
      vidBody.replaceChildren(...kids);
    }

    async function moveVideo(v, dir) {
      const same = videos.filter((x) => x.season === v.season);
      const other = same[same.indexOf(v) + dir];
      if (!other) return;
      const a = v.episode, b = other.episode;
      try {
        const [r1, r2] = await Promise.all([api.studio.videos.save({ id: v.id, episode: b }), api.studio.videos.save({ id: other.id, episode: a })]);
        Object.assign(v, r1); Object.assign(other, r2);
        renderVideos();
        loadCatalog(true).catch(() => {});
      } catch (e) { toast(e.message, "error"); }
    }

    async function removeVideo(v) {
      if (!await confirmDialog({ title: `"${v.name}" verwijderen?`, message: "De video en het bijbehorende bestand worden definitief verwijderd.", confirmText: "Verwijderen", danger: true })) return;
      try {
        await api.studio.videos.remove(v.id);
        videos = videos.filter((x) => x.id !== v.id);
        if (v.source === "storage" && isStoragePath(v.video_path)) api.studio.removeFiles("videos", [v.video_path]).catch(() => {});
        if (isStoragePath(v.thumb_path)) api.studio.removeFiles("artwork", [v.thumb_path]).catch(() => {});
        renderVideos();
        await loadCatalog(true);
        toast("Video verwijderd.", "ok");
      } catch (e) { toast(e.message, "error"); }
    }

    /* --- Video-venster ----------------------------------------------------------------------------------- */
    async function openVideoModal(video, preset = {}) {
      if (!await ensureSaved()) return;
      const series = form.kind === "series";
      const lastSeason = videos.length ? Math.max(...videos.map((v) => v.season)) : 1;
      const season0 = video?.season ?? preset.season ?? lastSeason;
      const f = {
        name: video?.name || "", description: video?.description || "",
        season: season0, episode: video?.episode ?? (Math.max(0, ...videos.filter((v) => v.season === season0).map((v) => v.episode)) + 1),
        thumb_path: video?.thumb_path || null, source: video?.source || "storage",
        video_path: video?.source === "url" ? video.video_path : "",
        youtube: video?.source === "youtube" ? `https://youtu.be/${video.video_path}` : "",
        duration_seconds: video?.duration_seconds ?? null, intro_start: video?.intro_start ?? null, intro_end: video?.intro_end ?? null,
      };
      const oldStorage = video?.source === "storage" ? video.video_path : null;
      let file = null;
      let uploadedPath = null;
      let ctrl = null;
      let durationAuto = false;
      const thumbTrash = new Set();
      const thumbNew = new Set();

      const nameIn = h("input", { class: "input", type: "text", maxLength: 140, value: f.name, placeholder: series ? "Naam van de aflevering" : "Naam van de video", autofocus: true });
      const descIn = h("textarea", { class: "textarea", style: { minHeight: "84px" }, maxLength: 800, value: f.description, placeholder: "Waar gaat deze video over?" });
      const seasonIn = h("input", { class: "input", type: "number", min: 1, max: 99, value: f.season });
      const epIn = h("input", { class: "input", type: "number", min: 1, max: 999, value: f.episode });
      const durIn = h("input", { class: "input", type: "number", min: 0, inputMode: "numeric", value: f.duration_seconds ?? "", placeholder: "Seconden" });
      const durHint = h("span", null);
      const introS = h("input", { class: "input", type: "number", min: 0, inputMode: "numeric", value: f.intro_start ?? "", placeholder: "Start (sec)" });
      const introE = h("input", { class: "input", type: "number", min: 0, inputMode: "numeric", value: f.intro_end ?? "", placeholder: "Einde (sec)" });
      const urlIn = h("input", { class: "input", type: "url", value: f.video_path, placeholder: "https://.../video.mp4 of .m3u8", autocomplete: "off", spellcheck: false });
      const updDur = () => { durHint.textContent = f.duration_seconds ? `${f.duration_seconds < 60 ? `${f.duration_seconds} sec` : fmtDuration(f.duration_seconds)}${durationAuto ? " (automatisch bepaald)" : ""}` : "Wordt automatisch bepaald als dat lukt. Je kunt het ook zelf invullen."; };
      const setDur = (v, auto) => { f.duration_seconds = v; durationAuto = auto; durIn.value = v ?? ""; updDur(); };
      durIn.addEventListener("input", () => { f.duration_seconds = intOrNull(durIn.value); durationAuto = false; updDur(); });
      updDur();

      const thumbField = imageField({ label: "Thumbnail", ratio: "wide", folder: "thumbs", hint: "Breed (16:9). Zonder thumbnail gebruiken we de achtergrond van de titel.",
        get: () => f.thumb_path, set: (v) => { f.thumb_path = v; if (v) thumbNew.add(v); },
        discard: (p) => { if (!isStoragePath(p)) return; if (video && p === video.thumb_path) thumbTrash.add(p); else api.studio.removeFiles("artwork", [p]).catch(() => {}); } });

      /* Bron: uploaden of externe link */
      const srcSeg = h("div", { class: "seg", role: "radiogroup", "aria-label": "Bron" }, [["storage", "Uploaden"], ["youtube", "YouTube"], ["url", "Externe link"]].map(([v, l]) =>
        h("button", { type: "button", role: "radio", dataset: { v }, onClick: () => { f.source = v; paintSrc(); } }, l)));
      const fileInput = h("input", { type: "file", accept: "video/*,.mp4,.m4v,.mov,.webm,.mkv", hidden: true, tabIndex: -1 });
      const dropBox = h("div", { class: "st-vdrop", role: "button", tabIndex: 0, "aria-label": "Videobestand kiezen" });
      const srcStorage = h("div", { class: "st-src" }, dropBox, fileInput);
      const ytIn = h("input", { class: "input", type: "text", value: f.youtube, placeholder: "https://youtu.be/... of https://www.youtube.com/watch?v=...", autocomplete: "off", spellcheck: false });
      const ytPrev = h("div", { class: "st-yt-prev", hidden: true });
      const paintYt = () => {
        const id = parseYouTubeId(ytIn.value);
        ytPrev.hidden = !id;
        ytIn.classList.toggle("is-error", !!ytIn.value.trim() && !id);
        if (id) ytPrev.replaceChildren(h("img", { src: youTubeThumb(id), alt: "", loading: "lazy" }), h("span", null, icon("check-circle"), "YouTube-video herkend"));
      };
      ytIn.addEventListener("input", paintYt);
      paintYt();
      const srcYt = h("div", { class: "st-src" },
        field("Link naar de YouTube-video", ytIn, "Plak de link uit de adresbalk of via Delen."),
        ytPrev,
        h("div", { class: "st-tip-box" }, icon("info"),
          h("p", null, "Zet de video op YouTube op 'Niet openbaar vermeld'. Dan staat hij niet in zoekresultaten, maar iedereen met de link kan hem op YouTube zelf wel bekijken. Video's die op 'Privé' staan, kunnen niet worden afgespeeld. Zet 'Inbedden toestaan' aan. De duur wordt bij het afspelen bepaald, je kunt hem hieronder ook invullen.")));
      const srcUrl = h("div", { class: "st-src" },
        field("Link naar de video", urlIn, "Een directe link naar een .mp4 of .m3u8 (HLS)."),
        h("div", { class: "st-tip-box" }, icon("info"),
          h("p", null, "Externe links zijn bedoeld voor grote bestanden, bijvoorbeeld op Cloudflare R2 of Cloudflare Stream. Het gratis Supabase-plan accepteert maximaal 50 MB per bestand.")),
        h("button", { type: "button", class: "btn btn-outline btn-sm", onClick: () => probeUrl(true) }, icon("clock"), "Duur bepalen"));

      function paintDrop() {
        let inner;
        if (file) {
          const big = file.size > FREE_LIMIT;
          inner = [icon("film"), h("div", { class: "st-vdrop-t" }, h("b", { class: "truncate" }, file.name), h("span", null, fmtBytes(file.size)),
            big ? h("span", { class: "st-warn" }, "Groter dan 50 MB: de limiet van het gratis Supabase-plan. Kies anders 'Externe link'.") : null),
            h("button", { type: "button", class: "st-ib", "aria-label": "Ander bestand kiezen", onClick: (e) => { e.stopPropagation(); fileInput.click(); } }, icon("refresh"))];
        } else if (oldStorage && f.source === "storage") {
          inner = [icon("film"), h("div", { class: "st-vdrop-t" }, h("b", { class: "truncate" }, decodeURIComponent(oldStorage.split("/").pop())), h("span", null, "Huidig bestand. Klik om een ander bestand te kiezen.")),
            h("button", { type: "button", class: "st-ib", "aria-label": "Ander bestand kiezen", onClick: (e) => { e.stopPropagation(); fileInput.click(); } }, icon("refresh"))];
        } else {
          inner = [icon("upload"), h("div", { class: "st-vdrop-t" }, h("b", null, "Sleep je video hierheen"), h("span", null, "of klik om een bestand te kiezen (mp4 werkt overal het best)"))];
        }
        dropBox.classList.toggle("has-file", !!file || !!oldStorage);
        dropBox.replaceChildren(...inner);
      }
      async function takeFile(fl) {
        if (!fl) return;
        if (!(fl.type.startsWith("video/") || /\.(mp4|m4v|mov|webm|mkv)$/i.test(fl.name))) { toast("Kies een videobestand (bij voorkeur mp4).", "error"); return; }
        file = fl; uploadedPath = null;
        if (!nameIn.value.trim()) { nameIn.value = fl.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "); f.name = nameIn.value; }
        paintDrop();
        const url = URL.createObjectURL(fl);
        const d = await probeDuration(url, 10000);
        URL.revokeObjectURL(url);
        if (d && file === fl) setDur(d, true);
      }
      async function probeUrl(manual) {
        const u = urlIn.value.trim();
        if (!/^https?:\/\//i.test(u)) { if (manual) toast("Plak eerst een geldige link (https://...).", "error"); return; }
        if (manual) toast("Duur opzoeken...", "info", 1500);
        const d = await probeDuration(u, 9000);
        if (d) setDur(d, true);
        else if (manual) toast(/\.m3u8(\?|$)/i.test(u) ? "Bij een HLS-stream kan de duur niet automatisch bepaald worden. Vul hem zelf in." : "Kon de duur niet bepalen. Vul hem zelf in.", "info");
      }
      dropBox.addEventListener("click", () => fileInput.click());
      dropBox.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); } });
      fileInput.addEventListener("change", () => { takeFile(fileInput.files[0]); fileInput.value = ""; });
      ["dragenter", "dragover"].forEach((ev) => dropBox.addEventListener(ev, (e) => { e.preventDefault(); dropBox.classList.add("is-over"); }));
      ["dragleave", "drop"].forEach((ev) => dropBox.addEventListener(ev, () => dropBox.classList.remove("is-over")));
      dropBox.addEventListener("drop", (e) => { e.preventDefault(); takeFile(e.dataTransfer.files[0]); });
      let urlTimer;
      urlIn.addEventListener("input", () => {
        // YouTube-link onder "Externe link" geplakt? Dan schakelen we vanzelf naar de bron YouTube.
        if (youTubeIdFromUrl(urlIn.value)) {
          ytIn.value = urlIn.value.trim(); urlIn.value = "";
          f.source = "youtube"; paintSrc(); paintYt();
          toast("Dat is een YouTube-link. De bron is aangepast naar YouTube.", "info");
          return;
        }
        clearTimeout(urlTimer); urlTimer = setTimeout(() => probeUrl(false), 700);
      });
      const lateProbe = () => clearTimeout(urlTimer);

      function paintSrc() {
        srcSeg.querySelectorAll("button").forEach((b) => { const on = b.dataset.v === f.source; b.classList.toggle("is-active", on); b.setAttribute("aria-checked", on); });
        srcStorage.hidden = f.source !== "storage";
        srcYt.hidden = f.source !== "youtube";
        srcUrl.hidden = f.source !== "url";
        paintDrop();
      }
      paintSrc();

      /* Voortgangspaneel tijdens uploaden */
      const ring = progressRing({ size: 110, stroke: 9 });
      const upName = h("b", { class: "truncate" });
      const upStat = h("span", { class: "st-upl-stat" });
      const upl = h("div", { class: "st-upl", hidden: true, role: "status" }, ring.el, upName, upStat,
        h("button", { type: "button", class: "btn btn-danger btn-sm", onClick: () => ctrl?.abort() }, icon("x"), "Upload annuleren"));

      const formEl = h("div", { class: "st-vm" },
        h("div", { class: "st-vm-main" },
          field("Naam", nameIn), field("Beschrijving", descIn),
          series ? h("div", { class: "field-row st-two" }, field("Seizoen", seasonIn), field("Aflevering", epIn)) : null,
          field("Duur (seconden)", durIn, durHint),
          h("details", { class: "st-details", open: f.intro_start != null || f.intro_end != null },
            h("summary", null, "Intro overslaan (optioneel)"),
            h("p", { class: "hint" }, "Toont een knop 'Intro overslaan' tussen deze twee momenten."),
            h("div", { class: "field-row st-two" }, field("Intro begint (sec)", introS), field("Intro eindigt (sec)", introE)))),
        h("div", { class: "st-vm-side" }, thumbField.el, h("div", { class: "field" }, h("span", { class: "label" }, "Bron van de video"), srcSeg, srcStorage, srcYt, srcUrl)));

      const cancelBtn = h("button", { class: "btn btn-outline", type: "button", onClick: () => cancel() }, "Annuleren");
      const okBtn = h("button", { class: "btn btn-gradient", type: "button", onClick: () => submit() }, icon("check"), video ? "Opslaan" : "Toevoegen");
      const modal = openModal({ title: video ? "Video bewerken" : series ? "Aflevering toevoegen" : "Video toevoegen", wide: true, dismissible: false, body: [formEl, upl], footer: [cancelBtn, okBtn] });
      const foot = modal.el.querySelector(".modal-foot");
      activeModal = modal;

      function cancel() {
        lateProbe();
        if (uploadedPath) api.studio.removeFiles("videos", [uploadedPath]).catch(() => {});
        for (const p of thumbNew) if (p !== video?.thumb_path) api.studio.removeFiles("artwork", [p]).catch(() => {});
        modal.close();
      }

      const showUpload = (on) => { formEl.hidden = on; upl.hidden = !on; foot.hidden = on; };

      async function submit() {
        f.name = nameIn.value.trim();
        f.description = descIn.value.trim();
        const season = series ? intOrNull(seasonIn.value) : 1;
        const episode = series ? intOrNull(epIn.value) : 1;
        f.intro_start = intOrNull(introS.value); f.intro_end = intOrNull(introE.value);
        const bad = (msg, el) => { toast(msg, "error"); el?.focus(); el?.classList.add("is-error"); setTimeout(() => el?.classList.remove("is-error"), 900); };
        if (!f.name) return bad("Geef de video een naam.", nameIn);
        if (series && (!season || season < 1)) return bad("Vul een seizoen in (1 of hoger).", seasonIn);
        if (series && (!episode || episode < 1)) return bad("Vul een afleveringsnummer in (1 of hoger).", epIn);
        if (f.intro_start != null && f.intro_end != null && f.intro_end <= f.intro_start) return bad("De intro moet eindigen na het begin.", introE);
        if ((f.intro_start != null) !== (f.intro_end != null)) return bad("Vul zowel het begin als het einde van de intro in, of laat beide leeg.", f.intro_start == null ? introS : introE);
        let videoPath;
        if (f.source === "youtube") {
          videoPath = parseYouTubeId(ytIn.value);
          if (!videoPath) return bad("Plak een geldige YouTube-link.", ytIn);
        } else if (f.source === "url") {
          videoPath = urlIn.value.trim();
          const yt = youTubeIdFromUrl(videoPath);
          if (yt) { f.source = "youtube"; videoPath = yt; } else
          if (!/^https:\/\/\S+$/i.test(videoPath)) return bad("Gebruik een geldige https-link naar de video.", urlIn);
        } else if (!file && !uploadedPath && !oldStorage) return toast("Kies eerst een videobestand, of gebruik een externe link.", "error");

        okBtn.classList.add("is-loading");
        try {
          if (f.source === "storage" && file && !uploadedPath) {
            ctrl = activeCtrl = new AbortController();
            upName.textContent = file.name; ring.set(0); upStat.textContent = "Starten...";
            showUpload(true);
            const t0 = performance.now();
            try {
              const r = await api.studio.upload("videos", file, { folder: titleId, signal: ctrl.signal, onProgress: (p, loaded, total) => {
                ring.set(p);
                const secs = (performance.now() - t0) / 1000;
                const speed = secs > 0.4 ? loaded / secs : 0;
                const eta = speed ? Math.max(0, Math.round((total - loaded) / speed)) : null;
                upStat.textContent = `${fmtBytes(loaded)} van ${fmtBytes(total)}${speed ? ` - ${fmtBytes(speed)}/s` : ""}${eta != null && p < 1 ? ` - nog ${eta < 60 ? `${eta} sec` : fmtDuration(eta)}` : ""}`;
              } });
              uploadedPath = r.path;
            } catch (e) {
              showUpload(false);
              if (e?.name === "AbortError") toast("Upload geannuleerd.", "info"); else toast(e.message, "error");
              return;
            } finally { ctrl = activeCtrl = null; }
            showUpload(false);
          }
          if (f.source === "storage") videoPath = uploadedPath || oldStorage;
          const payload = { title_id: titleId, name: f.name, description: f.description, season, episode, thumb_path: f.thumb_path, source: f.source, video_path: videoPath,
            duration_seconds: f.duration_seconds || null, intro_start: f.intro_start, intro_end: f.intro_end };
          if (video) payload.id = video.id;
          const row = await api.studio.videos.save(payload);
          const i = videos.findIndex((x) => x.id === row.id);
          if (i >= 0) videos[i] = row; else videos.push(row);
          // Oude bestanden opruimen (best-effort)
          if (oldStorage && oldStorage !== videoPath && isStoragePath(oldStorage)) api.studio.removeFiles("videos", [oldStorage]).catch(() => {});
          for (const p of thumbTrash) if (p !== f.thumb_path) api.studio.removeFiles("artwork", [p]).catch(() => {});
          lateProbe();
          renderVideos();
          modal.close();
          toast(video ? "Video opgeslagen." : "Video toegevoegd.", "ok");
          await loadCatalog(true);
        } catch (e) { toast(e.message, "error"); }
        okBtn.classList.remove("is-loading");
      }
    }

    /* --- Gevaarlijke zone ------------------------------------------------------------------------------------- */
    const dangerCard = h("section", { class: "st-card st-ed-card st-danger", hidden: !titleId },
      h("div", null, h("h3", null, "Gevaarlijke zone"), h("p", { class: "muted" }, "Verwijder deze titel met alle video's en afbeeldingen. Dit kun je niet ongedaan maken.")),
      h("button", { class: "btn btn-danger", type: "button", onClick: async () => {
        if (!await confirmDialog({ title: `"${form.title || "Deze titel"}" verwijderen?`, message: "De titel, alle video's en afbeeldingen worden definitief verwijderd.", confirmText: "Verwijderen", danger: true })) return;
        try {
          await deleteTitleFully(cat.byId.get(titleId) || { id: titleId, ...form });
          leaving = true;
          await loadCatalog(true);
          toast("Titel verwijderd.", "ok");
          navigate("/studio/content");
        } catch (e) { toast(e.message, "error"); }
      } }, icon("trash"), "Titel verwijderen"));

    /* --- Voorvertoning ------------------------------------------------------------------------------------------- */
    const pv = {
      cardImg: h("span", { class: "st-pv-img" }), cardTitle: h("b", { class: "truncate" }), cardMeta: h("small", { class: "truncate" }), cardBadge: h("span", { class: "st-pv-badge" }),
      heroKind: h("span", { class: "st-pv-kind" }), heroTitle: h("div", { class: "st-pv-title" }), heroTag: h("div", { class: "st-pv-tag" }), heroMeta: h("div", { class: "st-pv-meta" }),
      heroImg: h("span", { class: "st-pv-bg" }), feat: h("span", { class: "st-pv-feat", hidden: true }, icon("star", { fill: true }), "Uitgelicht"),
    };
    const aside = h("aside", { class: "st-ed-aside", "aria-label": "Voorvertoning" },
      h("div", { class: "st-card st-ed-card st-preview" },
        h("h3", null, "Voorvertoning"), h("p", { class: "muted" }, "Zo ziet het er op het platform uit."),
        h("div", { class: "label" }, "Kaart"),
        h("div", { class: "st-pv-card" }, h("div", { class: "st-pv-poster" }, pv.cardImg, pv.cardBadge), h("div", { class: "st-pv-cap" }, pv.cardTitle, pv.cardMeta)),
        h("div", { class: "label" }, "Startpagina"),
        h("div", { class: "st-pv-hero", "aria-hidden": "true" }, pv.heroImg, pv.feat,
          h("div", { class: "st-pv-hero-in" }, pv.heroKind, pv.heroTitle, pv.heroTag, pv.heroMeta,
            h("div", { class: "st-pv-btns" }, h("span", { class: "st-pv-play" }, icon("play", { fill: true }), "Afspelen"), h("span", { class: "st-pv-info" }, icon("info"), "Meer info"))))));

    const bgImg = (el, url) => { const v = url ? `url("${url.replace(/"/g, "%22")}")` : ""; if (el.dataset.u !== v) { el.dataset.u = v; el.style.backgroundImage = v; el.classList.toggle("has-img", !!v); } };
    function updatePreview() {
      const t = form.title.trim() || "Titel van je film of serie";
      bgImg(pv.cardImg, posterUrl(form));
      bgImg(pv.heroImg, backdropUrl(form));
      pv.cardImg.dataset.t = t;
      pv.cardTitle.textContent = t;
      pv.cardMeta.textContent = [kindLabel(form.kind), form.year].filter(Boolean).join(" - ");
      pv.cardBadge.textContent = form.status === "draft" ? "Concept" : form.status === "coming_soon" ? "Binnenkort" : "";
      pv.cardBadge.hidden = form.status === "published";
      pv.heroKind.textContent = form.kind === "series" ? "Serie" : "Film";
      pv.heroTitle.textContent = t;
      pv.heroTag.textContent = form.tagline;
      pv.heroTag.hidden = !form.tagline;
      pv.heroMeta.replaceChildren(...[form.year ? h("span", null, form.year) : null, ratingBadge(form.rating), form.genres.length ? h("span", { class: "truncate" }, form.genres.slice(0, 3).join(" - ")) : null].filter(Boolean));
      pv.feat.hidden = !form.featured;
    }

    /* --- Wijzigingen bijhouden ----------------------------------------------------------------------------------------- */
    function syncSegs() {
      kindSeg.querySelectorAll("button").forEach((b) => { const on = b.dataset.v === form.kind; b.classList.toggle("is-active", on); b.setAttribute("aria-checked", on); });
      statusSeg.querySelectorAll("button").forEach((b) => { const on = b.dataset.v === form.status; b.classList.toggle("is-active", on); b.setAttribute("aria-checked", on); });
      ratingBtns.querySelectorAll("button").forEach((b) => { const on = b.dataset.v === form.rating; b.classList.toggle("is-active", on); b.setAttribute("aria-checked", on); });
      const kids = KIDS_RATINGS.includes(form.rating);
      ratingNote.replaceChildren(icon(kids ? "check-circle" : "lock"), kids ? "Ook zichtbaar voor kinderprofielen (AL, 6 en 9)." : "Verborgen voor kinderprofielen. Alleen zichtbaar op gewone profielen.");
      ratingNote.classList.toggle("is-ok", kids);
      statusNote.textContent = STATUS_INFO[form.status];
      releaseField.hidden = form.status !== "coming_soon";
    }

    function changed() {
      const dirty = isDirty();
      dirtyEl.hidden = !dirty;
      saveBtn.disabled = saving || (!!titleId && !dirty);
      pubBtn.hidden = form.status !== "draft";
      pubBtn.disabled = saving;
      barTitle.textContent = form.title.trim() || (titleId ? "Zonder titel" : "Nieuwe titel");
      barSub.textContent = `${kindLabel(form.kind)}${titleId ? "" : " - nog niet opgeslagen"}`;
      dangerCard.hidden = !titleId;
      updatePreview();
    }

    /* --- Opslaan -------------------------------------------------------------------------------------------------------------- */
    function validate() {
      if (!form.title.trim()) return ["Geef je titel een naam.", titleIn];
      if (form.status === "coming_soon" && !form.release_at) return ["Kies wanneer de titel beschikbaar wordt.", releaseIn];
      if (form.year != null && (form.year < 1900 || form.year > 2100)) return ["Vul een geldig jaartal in.", yearIn];
      return null;
    }

    async function save({ publish = false, silent = false } = {}) {
      if (saving) return false;
      const bad = validate();
      if (bad) { toast(bad[0], "error"); bad[1].focus(); bad[1].classList.add("is-error"); return false; }
      if (publish && titleId && !videos.length && !await confirmDialog({ title: "Publiceren zonder video?", message: "Er staan nog geen video's bij deze titel. Kijkers zien hem dan wel, maar kunnen niets afspelen.", confirmText: "Toch publiceren" })) return false;
      saving = true;
      const btn = publish ? pubBtn : saveBtn;
      btn.classList.add("is-loading"); changed();
      try {
        const status = publish ? "published" : form.status;
        const payload = {
          kind: form.kind, title: form.title.trim(), tagline: form.tagline.trim() || null, description: form.description.trim() || null,
          year: form.year, genres: form.genres, rating: form.rating, poster_path: form.poster_path, backdrop_path: form.backdrop_path,
          status, release_at: status === "coming_soon" ? form.release_at : null, featured: form.featured, show_on_landing: form.show_on_landing,
        };
        if (titleId) payload.id = titleId;
        const wasNew = !titleId;
        const row = await api.studio.titles.save(payload);
        titleId = row.id;
        form.status = status;
        if (status !== "coming_soon") form.release_at = null;
        savedSnap = snap();
        for (const p of trash) if (p !== form.poster_path && p !== form.backdrop_path) api.studio.removeFiles("artwork", [p]).catch(() => {});
        trash.clear();
        savedFiles.poster_path = form.poster_path; savedFiles.backdrop_path = form.backdrop_path;
        // Nieuwe titel: adres aanpassen zonder het scherm opnieuw op te bouwen
        if (wasNew) history.replaceState(history.state, "", `#/studio/content/${titleId}`);
        syncSegs();
        await loadCatalog(true);
        renderVideos();
        if (!silent) toast(publish ? "Opgeslagen en gepubliceerd." : "Opgeslagen.", "ok");
        return true;
      } catch (e) {
        toast(e.message, "error");
        return false;
      } finally {
        saving = false;
        btn.classList.remove("is-loading");
        changed();
      }
    }

    /* --- Beschermen tegen per ongeluk weggaan -------------------------------------------------------------------------------- */
    scope.on(window, "beforeunload", (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ""; } });
    scope.on(document, "click", async (e) => {
      if (!isDirty() || e.defaultPrevented || e.button || e.ctrlKey || e.metaKey) return;
      const a = e.target.closest?.('a[href^="#/"]');
      const plat = e.target.closest?.(".st-platform, .st-top-home");
      if (!a && !plat) return;
      e.preventDefault(); e.stopPropagation();
      if (!await confirmLeave()) return;
      leaving = true;
      navigate(a ? a.getAttribute("href").slice(1) : session.profile ? "/browse" : "/profiles");
    }, true);

    /* --- Samenstellen ------------------------------------------------------------------------------------------------------------ */
    page.append(bar, h("div", { class: "st-ed-grid" },
      h("div", { class: "st-ed-form" },
        ...[basics, artwork, genres, rating, visibility, videosCard, dangerCard].map((c, i) => { c.classList.add("stagger"); c.style.setProperty("--i", i); return c; })),
      aside));

    paintGenres(); syncSegs(); renderVideos(); changed();
    if (!titleId) titleIn.focus({ preventScroll: true });

    return async () => {
      scope.dispose();
      activeCtrl?.abort();
      activeModal?.close();
      // Niet-opgeslagen uploads opruimen
      for (const k of ["poster_path", "backdrop_path"]) {
        if (form[k] && form[k] !== savedFiles[k] && isStoragePath(form[k])) api.studio.removeFiles("artwork", [form[k]]).catch(() => {});
      }
    };
  },
};
