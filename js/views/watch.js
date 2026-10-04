/* ==========================================================================
   Videospeler (route /watch/:videoId)
   - hervat waar je gebleven was, slaat elke ~10 sec je voortgang op
   - "Intro overslaan", automatisch volgende aflevering met aftelring
   - sneltoetsen, dubbeltikken om te spoelen, volume, snelheid, PiP, volledig scherm
   ========================================================================== */

import { h, Scope } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { fmtClock, clamp } from "../ui/format.js";
import { toast } from "../ui/toast.js";
import { api, loadScript } from "../api/index.js";
import { YouTubeMedia, youTubeErrorText } from "../ui/youtube.js";
import { getVideo, getTitle, nextVideo, thumbUrl, backdropUrl, isAvailable, visibleTitles, playableTitles, episodesOf } from "../data/catalog.js";
import { progressOf, saveProgress } from "../data/userdata.js";
import { session, isAdmin } from "../core/session.js";
import { back, navigate } from "../core/router.js";
import { VERSION } from "../version.js";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const HIDE_MS = 3000;        // muis: balk na 3 s weg
const HIDE_TOUCH_MS = 5000;  // aanraking: iets langer, zodat je rustig kunt kijken
const SAVE_MS = 10000;
const NEXT_COUNTDOWN = 10;   // volgende aflevering: pas in de laatste 10 seconden
const RECS_SECONDS = 15;     // aanbevelingen: laatste 15 seconden van een film (of laatste aflevering)

const store = {
  get() { try { return JSON.parse(localStorage.getItem("hp:player")) || {}; } catch { return {}; } },
  set(patch) { try { localStorage.setItem("hp:player", JSON.stringify({ ...this.get(), ...patch })); } catch { /* */ } },
};

function fail(root, title, text) {
  root.appendChild(h("div", { class: "empty", style: { minHeight: "100dvh", alignContent: "center" } },
    h("div", { class: "empty-icon" }, "📽️"), h("h3", null, title), h("p", null, text),
    h("button", { class: "btn btn-primary", onClick: () => back("/browse") }, "Terug")));
  return () => {};
}

async function attachSource(video, media, scope) {
  const isHls = media.type === "hls";
  if (isHls && !video.canPlayType("application/vnd.apple.mpegurl")) {
    if (!window.Hls) await loadScript("vendor/hls.light.min.js");
    if (window.Hls?.isSupported()) {
      const hls = new window.Hls({ maxBufferLength: 30, enableWorker: true });
      hls.loadSource(media.url);
      hls.attachMedia(video);
      hls.on(window.Hls.Events.ERROR, (_, d) => { if (d.fatal) video.dispatchEvent(new Event("error")); });
      scope.add(() => hls.destroy());
      return;
    }
  }
  video.src = media.url;
}

/** Andere titels om hierna te kijken: eerst dezelfde genres, daarna uitgelicht/nieuw/recent. */
function recommendationsFor(title, profile) {
  const mine = new Set(title.genres || []);
  return playableTitles(profile)
    .filter((t) => t.id !== title.id && episodesOf(t.id).length)
    .map((t) => ({ t, s: (t.genres || []).filter((g) => mine.has(g)).length * 3 + (t.kind === title.kind ? 1 : 0) + (t.featured ? 1 : 0) + (t.is_new ? 1 : 0) }))
    .sort((a, b) => b.s - a.s || new Date(b.t.created_at) - new Date(a.t.created_at))
    .slice(0, 4).map((x) => x.t);
}

export default {
  async mount(root, ctx) {
    const scope = new Scope();
    const video = getVideo(ctx.params.id);
    const title = video && getTitle(video.title_id);
    if (!video || !title || !visibleTitles(session.profile).some((t) => t.id === title.id)) return fail(root, "Video niet gevonden", "Deze video bestaat niet meer of is niet beschikbaar voor dit profiel.");
    if (!isAvailable(title) && session.member?.role !== "admin") return fail(root, "Nog niet beschikbaar", "Deze titel verschijnt binnenkort.");

    const nxt = nextVideo(video);
    const prefs = store.get();
    const label = title.kind === "series" ? `S${video.season} A${video.episode}: ${video.name}` : video.name !== title.title ? video.name : "";

    /* --------------------------------- opbouw --------------------------------- */
    // Waar begint de video? (link met ?t=, of waar je was gebleven)
    const isYT = video.source === "youtube";
    const rec0 = progressOf(video.id);
    const startAt = ctx.query.t ? +ctx.query.t : rec0 && !rec0.completed && rec0.position_seconds > 5 ? rec0.position_seconds - 2 : 0;
    // YouTube krijgt een adapter die zich als <video> gedraagt, zodat alle bediening hieronder hetzelfde werkt
    const v = isYT
      ? new YouTubeMedia({ videoId: video.video_path, start: startAt, captions: !!prefs.captions })
      : h("video", { class: "pl-video", playsInline: true, preload: "auto", poster: thumbUrl(video, title) || undefined, "webkit-playsinline": "" });
    if (!isYT) v.setAttribute("playsinline", "");
    v.volume = clamp(prefs.volume ?? 1, 0, 1);
    v.muted = !!prefs.muted;

    const spinner = h("div", { class: "pl-spinner", role: "status", "aria-label": "Laden" }, h("i", { class: "pl-ring-spin" }));
    const flash = h("div", { class: "pl-flash" });
    const curtain = isYT ? h("div", { class: "pl-curtain" }, thumbUrl(video, title) ? h("img", { src: thumbUrl(video, title), alt: "", decoding: "async" }) : null) : null;
    const skipL = h("div", { class: "pl-skip left" }, h("span", null));
    const skipR = h("div", { class: "pl-skip right" }, h("span", null));
    const centerBtn = h("button", { class: "pl-center", "aria-label": "Afspelen of pauzeren" });
    const hint = h("div", { class: "pl-hint" });

    const seekBuf = h("i", { class: "pl-buf" });
    const seekFill = h("i", { class: "pl-fill" });
    const seekThumb = h("b", { class: "pl-thumb" });
    const seekTip = h("span", { class: "pl-tip" }, "0:00");
    const seek = h("div", { class: "pl-seek", role: "slider", tabIndex: 0, "aria-label": "Voortgang", "aria-valuemin": 0 }, h("div", { class: "pl-track" }, seekBuf, seekFill), seekThumb, seekTip);

    const playBtn = h("button", { class: "pl-btn", "aria-label": "Afspelen" });
    const muteBtn = h("button", { class: "pl-btn", "aria-label": "Geluid uit" });
    const vol = h("input", { class: "pl-vol", type: "range", min: 0, max: 1, step: 0.02, value: v.muted ? 0 : v.volume, "aria-label": "Volume" });
    const time = h("span", { class: "pl-time" }, "0:00 / 0:00");
    const speedBtn = h("button", { class: "pl-btn pl-text-btn", "aria-label": "Afspeelsnelheid", "aria-haspopup": "menu" }, "1x");
    const ccBtn = isYT ? h("button", { class: `pl-btn pl-cc${prefs.captions ? " is-on" : ""}`, "aria-label": "Ondertiteling", "aria-pressed": String(!!prefs.captions), title: "Ondertiteling (C)" }, icon("captions")) : null;
    const pipBtn = h("button", { class: "pl-btn", "aria-label": "Beeld-in-beeld" }, icon("pip"));
    const fsBtn = h("button", { class: "pl-btn", "aria-label": "Volledig scherm" });
    const nextBtn = nxt ? h("button", { class: "pl-btn", "aria-label": "Volgende aflevering", title: "Volgende aflevering (N)" }, icon("skip-next")) : null;
    const speedMenu = h("div", { class: "menu pl-menu", role: "menu", hidden: true },
      SPEEDS.map((s) => h("button", { class: "menu-item", role: "menuitemradio", dataset: { s }, onClick: () => { setSpeed(s); speedMenu.hidden = true; } }, s === 1 ? "Normaal" : `${s}x`)));

    const introBtn = h("button", { class: "pl-float pl-intro btn btn-ghost", hidden: true }, icon("skip-next"), "Intro overslaan");
    const ring = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    ring.setAttribute("viewBox", "0 0 44 44");
    ring.setAttribute("class", "pl-ring");
    ring.innerHTML = '<circle cx="22" cy="22" r="19" class="bg"/><circle cx="22" cy="22" r="19" class="fg"/>';
    const nextCount = h("span", null, String(NEXT_COUNTDOWN));
    const ringFg = () => ring.querySelector(".fg");
    const nextCard = nxt ? h("div", { class: "pl-float pl-next", hidden: true },
      h("div", { class: "pl-next-ring" }, ring, nextCount),
      h("div", { class: "pl-next-text" }, h("small", null, "Volgende aflevering"), h("strong", { class: "truncate" }, `${nxt.name}`)),
      h("button", { class: "btn btn-primary btn-sm", onClick: () => goNext() }, icon("play", { fill: true }), "Nu kijken"),
      h("button", { class: "btn btn-ghost btn-sm", onClick: () => { nextDismissed = true; hideNext(); } }, "Annuleren")) : null;

    /* Aanbevelingen aan het eind van een film (of de laatste aflevering van een serie) */
    const recList = nxt ? [] : recommendationsFor(title, session.profile);
    const recPlay = (t) => {
      const eps = episodesOf(t.id);
      const target = eps.find((e) => !progressOf(e.id)?.completed) || eps[0];
      if (target) navigate(`/watch/${target.id}`, { replace: true }); else navigate(`/title/${t.id}`);
    };
    const recs = recList.length ? h("div", { class: "pl-recs", hidden: true },
      h("div", { class: "pl-recs-head" }, h("strong", null, "Hierna kijken"),
        h("button", { class: "pl-recs-x", "aria-label": "Aanbevelingen sluiten", onClick: () => { recsDismissed = true; recs.hidden = true; } }, icon("x"))),
      h("div", { class: "pl-recs-list" }, recList.map((t) =>
        h("button", { class: "pl-rec", "aria-label": `Kijk ${t.title}`, onClick: () => recPlay(t) },
          h("span", { class: "pl-rec-img" }, backdropUrl(t) ? h("img", { src: backdropUrl(t), alt: "", loading: "lazy", decoding: "async" }) : null, h("i", null, icon("play", { fill: true }))),
          h("span", { class: "pl-rec-name truncate" }, t.title),
          h("small", { class: "truncate" }, [t.kind === "series" ? "Serie" : "Film", t.year].filter(Boolean).join(" - ")))))) : null;

    const endNextBtn = h("button", { class: "btn btn-gradient btn-lg", hidden: true, onClick: () => goNext() }, icon("skip-next"), "Volgende aflevering");
    const endCard = h("div", { class: "pl-end", hidden: true },
      h("h2", null, title.title), h("p", { class: "muted" }, "Je bent klaar met kijken."),
      h("div", { class: "pl-end-actions" },
        endNextBtn,
        h("button", { class: "btn btn-primary btn-lg", onClick: () => { endCard.hidden = true; if (recs) recs.hidden = true; v.currentTime = 0; v.play(); } }, icon("refresh"), "Opnieuw kijken"),
        h("button", { class: "btn btn-ghost btn-lg", onClick: () => back(`/title/${title.id}`) }, "Terug naar titel")));

    const ytUrl = isYT ? `https://www.youtube.com/watch?v=${encodeURIComponent(video.video_path)}` : null;
    const ytLink = isYT ? h("a", { class: "btn btn-outline", href: ytUrl, target: "_blank", rel: "noopener" }, icon("link"), "Open in YouTube") : null;
    const errDetail = h("small", { class: "pl-err-detail faint" });
    const retryBtn = h("button", { class: "btn btn-primary" }, icon("refresh"), "Opnieuw proberen");
    const errorCard = h("div", { class: "pl-error", hidden: true },
      h("div", { class: "empty-icon" }, "⚠️"), h("h3", null, "Afspelen mislukt"), h("p", { class: "muted", id: "pl-err-text" }, "Deze video kan nu niet worden afgespeeld."), errDetail,
      h("div", { class: "pl-end-actions" },
        retryBtn, ytLink,
        h("button", { class: "btn btn-outline", onClick: () => back(`/title/${title.id}`) }, "Terug")));

    const top = h("div", { class: "pl-top" },
      h("button", { class: "pl-btn pl-back", "aria-label": "Terug", onClick: exit }, icon("arrow-left")),
      h("div", { class: "pl-title" }, h("strong", { class: "truncate" }, title.title), label ? h("span", { class: "truncate" }, label) : null));

    const bottom = h("div", { class: "pl-bottom" },
      seek,
      h("div", { class: "pl-row" },
        playBtn,
        h("button", { class: "pl-btn", "aria-label": "10 seconden terug", title: "10 seconden terug (J)", onClick: () => skip(-10) }, icon("back-10")),
        h("button", { class: "pl-btn", "aria-label": "10 seconden vooruit", title: "10 seconden vooruit (L)", onClick: () => skip(10) }, icon("fwd-10")),
        h("div", { class: "pl-volwrap" }, muteBtn, vol),
        time,
        h("span", { class: "pl-spacer" }),
        nextBtn,
        ccBtn,
        h("div", { class: "pl-speedwrap" }, speedBtn, speedMenu),
        document.pictureInPictureEnabled && !isYT ? pipBtn : null,
        fsBtn));

    const ui = h("div", { class: "pl-ui" }, top, centerBtn, bottom);
    const tapLink = isYT ? h("a", { class: "pl-ytlink btn btn-ghost btn-sm", href: ytUrl, target: "_blank", rel: "noopener" }, icon("link"), "Start niet? Open in YouTube") : null;
    const stage = h("div", { class: `pl is-paused is-loading is-ui${isYT ? " is-yt is-curtain" : ""}` }, isYT ? v.el : v, curtain, spinner, skipL, skipR, flash, hint, ui, introBtn, nextCard, endCard, recs, tapLink, errorCard);
    root.appendChild(stage);

    /* --------------------------------- gedrag --------------------------------- */
    let hideTimer = null;
    let lastTouchAt = 0;        // tijdstip van de laatste aanraking (telefoons sturen daarna ook nagebootste muisberichten)
    let nextDismissed = false;
    let recsDismissed = false;
    let duration = 0;
    let acc = 0;         // echte kijktijd sinds de laatste keer opslaan
    let lastT = 0;
    let dragging = false;
    let ended = false;
    let leaving = false;

    const setIcons = () => {
      const paused = v.paused;
      playBtn.replaceChildren(icon(paused ? "play" : "pause", { fill: true }));
      playBtn.setAttribute("aria-label", paused ? "Afspelen" : "Pauzeren");
      centerBtn.replaceChildren(icon(paused ? "play" : "pause", { fill: true }));
      stage.classList.toggle("is-paused", paused);
      const m = v.muted || v.volume === 0;
      muteBtn.replaceChildren(icon(m ? "volume-x" : v.volume < 0.5 ? "volume-1" : "volume-2"));
      muteBtn.setAttribute("aria-label", m ? "Geluid aan" : "Geluid uit");
      const fs = isFullscreen();
      fsBtn.replaceChildren(icon(fs ? "minimize" : "maximize"));
      fsBtn.setAttribute("aria-label", fs ? "Volledig scherm verlaten" : "Volledig scherm");
    };

    function showUi() {
      stage.classList.add("is-ui");
      clearTimeout(hideTimer);
      const ms = Date.now() - lastTouchAt < 8000 ? HIDE_TOUCH_MS : HIDE_MS;
      if (!v.paused && !dragging && speedMenu.hidden) hideTimer = setTimeout(() => stage.classList.remove("is-ui"), ms);
    }
    const flashIcon = (name) => {
      flash.replaceChildren(icon(name, { fill: true }));
      flash.classList.remove("go"); void flash.offsetWidth; flash.classList.add("go");
    };
    const say = (text) => {
      hint.textContent = text;
      hint.classList.remove("go"); void hint.offsetWidth; hint.classList.add("go");
    };

    function togglePlay() {
      if (ended) { endCard.hidden = true; ended = false; v.currentTime = 0; }
      if (v.paused) { v.play().catch(() => {}); flashIcon("play"); } else { v.pause(); flashIcon("pause"); }
    }
    function skip(sec, side) {
      if (!duration) return;
      v.currentTime = clamp(v.currentTime + sec, 0, duration);
      const el = sec > 0 ? skipR : skipL;
      el.firstChild.textContent = `${sec > 0 ? "+" : "-"}${Math.abs(sec)} s`;
      el.classList.remove("go"); void el.offsetWidth; el.classList.add("go");
      paintProgress();
      showUi();
    }
    function setVolume(x) {
      v.volume = clamp(x, 0, 1);
      v.muted = v.volume === 0;
      vol.value = v.muted ? 0 : v.volume;
      store.set({ volume: v.volume || prefs.volume || 1, muted: v.muted });
      say(`Volume ${Math.round(v.volume * 100)}%`);
    }
    function setSpeed(s) {
      v.playbackRate = s;
      speedBtn.textContent = `${s}x`;
      [...speedMenu.children].forEach((b) => b.setAttribute("aria-checked", String(+b.dataset.s === s)));
      say(`Snelheid ${s}x`);
    }
    const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
    async function toggleFullscreen() {
      try {
        if (isFullscreen()) await (document.exitFullscreen?.() || document.webkitExitFullscreen?.());
        else if (stage.requestFullscreen) await stage.requestFullscreen({ navigationUI: "hide" });
        else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen(); // iPhone
      } catch { /* niet toegestaan */ }
      setIcons();
    }
    function exit() {
      if (isFullscreen()) { toggleFullscreen(); return; }
      back(`/title/${title.id}`);
    }
    function goNext() {
      if (!nxt || leaving) return;
      navigate(`/watch/${nxt.id}`, { replace: true });
    }

    /* Voortgangsbalk */
    function paintProgress() {
      const t = v.currentTime || 0;
      const pct = duration ? (t / duration) * 100 : 0;
      seekFill.style.width = `${pct}%`;
      seekThumb.style.left = `${pct}%`;
      seek.setAttribute("aria-valuenow", String(Math.round(t)));
      seek.setAttribute("aria-valuemax", String(Math.round(duration)));
      seek.setAttribute("aria-valuetext", `${fmtClock(t)} van ${fmtClock(duration)}`);
      time.textContent = `${fmtClock(t)} / ${fmtClock(duration)}`;
      if (v.buffered.length && duration) {
        let end = 0;
        for (let i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) <= t + 0.5) end = Math.max(end, v.buffered.end(i));
        seekBuf.style.width = `${(end / duration) * 100}%`;
      }
    }
    const frac = (e) => { const r = seek.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width, 0, 1); };
    scope.on(seek, "pointermove", (e) => {
      const f = frac(e);
      seekTip.style.left = `${f * 100}%`;
      seekTip.textContent = fmtClock(f * duration);
      if (dragging) { seekFill.style.width = `${f * 100}%`; seekThumb.style.left = `${f * 100}%`; time.textContent = `${fmtClock(f * duration)} / ${fmtClock(duration)}`; }
    });
    scope.on(seek, "pointerdown", (e) => {
      if (!duration) return;
      dragging = true; seek.setPointerCapture(e.pointerId); stage.classList.add("is-seeking");
      const f = frac(e);
      seekFill.style.width = `${f * 100}%`; seekThumb.style.left = `${f * 100}%`;
    });
    scope.on(seek, "pointerup", (e) => {
      if (!dragging) return;
      dragging = false; stage.classList.remove("is-seeking");
      v.currentTime = frac(e) * duration;
      ended = false; endCard.hidden = true;
      showUi();
    });
    scope.on(seek, "pointercancel", () => { dragging = false; stage.classList.remove("is-seeking"); });

    /* Opslaan van voortgang */
    async function save() {
      if (!duration || !isFinite(duration) || !session.profile) return;
      const delta = Math.round(acc); acc = 0;
      try { await saveProgress({ video, position: v.currentTime, duration, delta }); } catch (e) { console.warn("Voortgang niet opgeslagen:", e.message); }
    }
    scope.interval(() => { if (!v.paused) save(); }, SAVE_MS);

    /* Volgende aflevering: alleen in de laatste seconden, de ring loopt mee met de echte resttijd */
    function hideNext() { if (nextCard) nextCard.hidden = true; }
    function showNext(remaining) {
      if (!nextCard || nextDismissed) return;
      if (nextCard.hidden) nextCard.hidden = false;
      nextCount.textContent = String(Math.max(1, Math.ceil(remaining)));
      ringFg().style.strokeDashoffset = String(119.4 * clamp(remaining / NEXT_COUNTDOWN, 0, 1));
    }
    function hideRecs() { if (recs) recs.hidden = true; }

    /* --------------------------------- video-events --------------------------------- */
    v.addEventListener("loadedmetadata", () => {
      duration = v.duration || 0;
      if (!isYT && startAt > 0 && startAt < duration - 3) v.currentTime = startAt; // YouTube start al op de juiste plek
      lastT = v.currentTime;
      paintProgress();
    });
    v.addEventListener("durationchange", () => {
      duration = v.duration || 0;
      paintProgress();
      // YouTube geeft de duur pas bij het afspelen door: bewaar hem voor beheerders (voor de kaartjes)
      if (isYT && duration > 0 && !video.duration_seconds && isAdmin()) {
        video.duration_seconds = Math.round(duration);
        api.studio.videos.save({ id: video.id, duration_seconds: video.duration_seconds }).catch(() => {});
      }
    });
    if (isYT) {
      // Start YouTube niet vanzelf (iPhone, strikte browsers)? Laat dan YouTube's eigen knop tikbaar zijn.
      v.addEventListener("autoplayblocked", () => { stage.classList.remove("is-curtain"); stage.classList.add("needs-tap"); say("Tik op de afspeelknop"); showUi(); });
      v.addEventListener("autoplayok", () => { stage.classList.remove("needs-tap"); setTimeout(() => stage.classList.remove("is-curtain"), 150); });
      v.addEventListener("needsound", needSound);
    }
    v.addEventListener("timeupdate", () => {
      const t = v.currentTime;
      if (!v.paused && !v.seeking && t > lastT && t - lastT < 2) acc += t - lastT;
      lastT = t;
      if (!dragging) paintProgress();
      if (video.intro_end && t >= (video.intro_start ?? 0) && t < video.intro_end - 1) introBtn.hidden = false; else introBtn.hidden = true;
      const remaining = duration - t;
      if (nxt && duration > 20) {
        if (remaining <= NEXT_COUNTDOWN && remaining > 0) showNext(remaining);
        else if (remaining > NEXT_COUNTDOWN + 1.5) { nextDismissed = false; hideNext(); }
      }
      if (recs && duration > 30) {
        if (remaining <= RECS_SECONDS && remaining > 0) { if (!recsDismissed && recs.hidden) recs.hidden = false; }
        else if (remaining > RECS_SECONDS + 1.5) { recsDismissed = false; hideRecs(); }
      }
    });
    v.addEventListener("play", () => { setIcons(); showUi(); requestWake(); ended = false; });
    v.addEventListener("pause", () => { setIcons(); showUi(); if (!v.ended) save(); });
    v.addEventListener("waiting", () => stage.classList.add("is-loading"));
    v.addEventListener("seeking", () => stage.classList.add("is-loading"));
    for (const ev of ["canplay", "playing", "seeked"]) v.addEventListener(ev, () => { stage.classList.remove("is-loading"); errorCard.hidden = true; });
    v.addEventListener("progress", paintProgress);
    v.addEventListener("volumechange", setIcons);
    v.addEventListener("ratechange", () => { speedBtn.textContent = `${v.playbackRate}x`; });
    v.addEventListener("ended", async () => {
      ended = true;
      await save();
      hideNext();
      if (nxt && !nextDismissed) { goNext(); return; }       // geannuleerd? dan blijf je op dit scherm
      endNextBtn.hidden = !nxt;
      if (recs) recs.hidden = false;
      endCard.hidden = false; stage.classList.add("is-ui");
    });
    v.addEventListener("error", () => {
      stage.classList.remove("is-loading");
      if (isYT) errDetail.textContent = v.log.slice(-4).join(" | ");
      errorCard.querySelector("#pl-err-text").textContent = isYT ? youTubeErrorText(v.error?.code)
        : v.error?.code === 4 ? "Dit bestand kan niet worden afgespeeld (formaat of link niet ondersteund)." : "Er ging iets mis bij het laden van de video. Controleer je verbinding.";
      errorCard.hidden = false;
    });

    /* --------------------------------- bediening --------------------------------- */
    // De browser liet alleen gedempt starten: laat zien dat het geluid nog aan moet
    function needSound() {
      say("Geluid staat uit. Tik op het luidsprekertje.");
      muteBtn.classList.add("attn");
      showUi();
    }
    function toggleCaptions() {
      if (!isYT) return;
      const on = !v.captions;
      v.setCaptions(on);
      store.set({ captions: on });
      ccBtn.classList.toggle("is-on", on);
      ccBtn.setAttribute("aria-pressed", String(on));
      say(on ? "Ondertiteling aan" : "Ondertiteling uit");
    }
    if (ccBtn) scope.on(ccBtn, "click", toggleCaptions);
    scope.on(playBtn, "click", togglePlay);
    scope.on(retryBtn, "click", () => load());
    scope.on(centerBtn, "click", (e) => { e.stopPropagation(); togglePlay(); });
    scope.on(muteBtn, "click", () => { muteBtn.classList.remove("attn"); v.muted = !v.muted; if (!v.muted && v.volume === 0) v.volume = 0.6; vol.value = v.muted ? 0 : v.volume; store.set({ muted: v.muted, volume: v.volume }); });
    scope.on(vol, "input", () => { v.volume = +vol.value; v.muted = v.volume === 0; store.set({ volume: v.volume, muted: v.muted }); });
    scope.on(fsBtn, "click", toggleFullscreen);
    scope.on(pipBtn, "click", async () => { try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await v.requestPictureInPicture(); } catch { toast("Beeld-in-beeld is niet beschikbaar.", "info"); } });
    scope.on(speedBtn, "click", (e) => { e.stopPropagation(); speedMenu.hidden = !speedMenu.hidden; if (!speedMenu.hidden) setSpeed(v.playbackRate), say(""); showUi(); });
    scope.on(document, "click", (e) => { if (!speedMenu.hidden && !speedMenu.contains(e.target)) speedMenu.hidden = true; });
    scope.on(introBtn, "click", () => { v.currentTime = video.intro_end; introBtn.hidden = true; });
    nextBtn && scope.on(nextBtn, "click", goNext);
    scope.on(document, "fullscreenchange", setIcons);
    scope.on(document, "webkitfullscreenchange", setIcons);

    /* Klikken/tikken op het beeld */
    let lastTap = 0, tapTimer = null;
    scope.on(stage, "pointerdown", (e) => { if (e.pointerType === "touch") { lastTouchAt = Date.now(); if (stage.classList.contains("is-ui")) showUi(); } });
    scope.on(stage, "pointerup", (e) => {
      if (e.pointerType === "touch") lastTouchAt = Date.now();
      if (e.target.closest(".pl-bottom, .pl-top, .pl-float, .pl-end, .pl-error, .pl-center, .pl-recs")) return;
      if (e.pointerType === "mouse") {
        if (e.button !== 0) return;
        clearTimeout(tapTimer);
        tapTimer = setTimeout(togglePlay, 220);       // wacht op mogelijke dubbelklik
        return;
      }
      // aanraking: dubbeltik links/rechts = spoelen, enkele tik = bediening tonen/verbergen
      const now = Date.now();
      lastTouchAt = now;
      const uiWas = stage.classList.contains("is-ui");   // nu bepalen: daarna sturen telefoons nog nagebootste muisberichten
      const r = stage.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      if (now - lastTap < 320 && (x < 0.35 || x > 0.65)) { clearTimeout(tapTimer); skip(x < 0.5 ? -10 : 10); lastTap = 0; return; }
      lastTap = now;
      clearTimeout(tapTimer);
      tapTimer = setTimeout(() => {
        if (uiWas && !v.paused) { clearTimeout(hideTimer); stage.classList.remove("is-ui"); } else showUi();
      }, 240);
    });
    scope.on(stage, "dblclick", (e) => { if (e.pointerType === "touch" || e.target.closest(".pl-bottom, .pl-top, .pl-float, .pl-recs")) return; clearTimeout(tapTimer); toggleFullscreen(); });
    scope.on(stage, "mousemove", () => { if (Date.now() - lastTouchAt > 800) showUi(); });
    scope.on(stage, "keydown", showUi);

    /* Sneltoetsen */
    scope.on(document, "keydown", (e) => {
      if (e.target.closest("input:not(.pl-vol), textarea, select") || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key;
      const on = (fn) => { e.preventDefault(); fn(); showUi(); };
      if (k === " " || k === "k" || k === "K") { if (e.target.closest("button") && k === " ") return; on(togglePlay); }
      else if (k === "ArrowLeft" || k === "j" || k === "J") { if (e.target === seek && k === "ArrowLeft") { on(() => skip(-5)); } else on(() => skip(-10)); }
      else if (k === "ArrowRight" || k === "l" || k === "L") { if (e.target === seek && k === "ArrowRight") { on(() => skip(5)); } else on(() => skip(10)); }
      else if (k === "ArrowUp") on(() => setVolume(v.volume + 0.1));
      else if (k === "ArrowDown") on(() => setVolume(v.volume - 0.1));
      else if (k === "m" || k === "M") on(() => { v.muted = !v.muted; store.set({ muted: v.muted }); say(v.muted ? "Geluid uit" : "Geluid aan"); });
      else if (k === "f" || k === "F") on(toggleFullscreen);
      else if (k === "n" || k === "N") { if (nxt) on(goNext); }
      else if ((k === "c" || k === "C") && isYT) on(toggleCaptions);
      else if (k === "<" || k === ",") on(() => setSpeed(SPEEDS[Math.max(0, SPEEDS.indexOf(v.playbackRate) - 1)] ?? 1));
      else if (k === ">" || k === ".") on(() => setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(v.playbackRate) + 1)] ?? 1));
      else if (/^[0-9]$/.test(k) && duration) on(() => { v.currentTime = (+k / 10) * duration; });
      else if (k === "Escape") { if (!speedMenu.hidden) { speedMenu.hidden = true; } else exit(); }
    });

    /* Voortgang veiligstellen bij weggaan */
    scope.on(document, "visibilitychange", () => { if (document.hidden) save(); });
    scope.on(window, "pagehide", save);

    /* Scherm aan houden en mediabediening op telefoon/vergrendelscherm */
    let wake = null;
    async function requestWake() { try { wake = await navigator.wakeLock?.request("screen"); } catch { /* niet ondersteund */ } }
    scope.add(() => { wake?.release?.().catch(() => {}); });
    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ title: label || title.title, artist: title.title, album: "Hoeven+", artwork: thumbUrl(video, title) ? [{ src: thumbUrl(video, title), sizes: "640x360" }] : [] });
        navigator.mediaSession.setActionHandler("play", () => v.play());
        navigator.mediaSession.setActionHandler("pause", () => v.pause());
        navigator.mediaSession.setActionHandler("seekbackward", () => skip(-10));
        navigator.mediaSession.setActionHandler("seekforward", () => skip(10));
        if (nxt) navigator.mediaSession.setActionHandler("nexttrack", goNext);
      } catch { /* niet alle acties bestaan overal */ }
    }

    /* --------------------------------- laden --------------------------------- */
    async function load() {
      errorCard.hidden = true; stage.classList.add("is-loading");
      if (isYT) stage.classList.add("is-curtain");
      try {
        if (isYT) {
          if (v._player) await v.reload(); else await v.init();
          setSpeed(1);
          v.play();
          return;
        }
        const media = await api.media.video(video);
        await attachSource(v, media, scope);
        setSpeed(1);
        await v.play().catch(async () => {
          // Geblokkeerd met geluid? Gedempt starten mag altijd; de kijker zet het geluid zelf aan.
          try { v.muted = true; await v.play(); needSound(); } catch { stage.classList.remove("is-loading"); }
        });
      } catch (e) {
        stage.classList.remove("is-loading");
        errorCard.querySelector("#pl-err-text").textContent = e.message;
        errorCard.hidden = false;
      }
    }
    /* Diagnose: ?debug=1, of drie keer snel op de titel tikken */
    let debugBox = null;
    function toggleDebug() {
      if (debugBox) { debugBox.remove(); debugBox = null; return; }
      debugBox = h("pre", { class: "pl-debug" });
      stage.appendChild(debugBox);
      const paint = () => {
        if (!debugBox) return;
        const lines = [
          `Hoeven+ ${VERSION} - ${isYT ? "YouTube" : video.source}`,
          `${v.paused ? "gepauzeerd" : "speelt"} - ${fmtClock(v.currentTime)} / ${fmtClock(duration)} - geluid ${v.muted ? "UIT" : "aan"}`,
          isYT ? `staat ${v._state} (-1 start, 3 laden, 1 speelt, 2 pauze, 5 klaar) - gordijn ${stage.classList.contains("is-curtain") ? "ja" : "nee"} - tikken ${stage.classList.contains("needs-tap") ? "ja" : "nee"}`
            : `readyState ${v.readyState} - netwerk ${v.networkState} - fout ${v.error ? v.error.code : "geen"}`,
          `scherm ${innerWidth}x${innerHeight} - ${navigator.userAgent.replace(/^Mozilla\/5\.0 /, "").slice(0, 70)}`,
          ...(isYT ? v.log : []),
        ];
        debugBox.textContent = lines.join("\n");
      };
      paint();
      scope.interval(paint, 500);
    }
    let taps = [];
    scope.on(top.querySelector(".pl-title"), "pointerup", () => {
      const now = Date.now(); taps = [...taps.filter((t) => now - t < 900), now];
      if (taps.length >= 3) { taps = []; toggleDebug(); }
    });
    if (ctx.query.debug) toggleDebug();

    setIcons();
    load();
    showUi();

    return async () => {
      leaving = true;
      clearTimeout(tapTimer); clearTimeout(hideTimer);
      save();
      if (isFullscreen()) { try { await (document.exitFullscreen?.() || document.webkitExitFullscreen?.()); } catch { /* */ } }
      try { if (isYT) v.destroy(); else { v.pause(); v.removeAttribute("src"); v.load(); } } catch { /* */ }
      if ("mediaSession" in navigator) navigator.mediaSession.metadata = null;
      scope.dispose();
    };
  },
};
