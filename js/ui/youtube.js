/* ==========================================================================
   YouTube als videobron
   - parseYouTubeId(): haalt de video-id uit een link (of een kale id)
   - YouTubeMedia: praat met de YouTube IFrame API, maar gedraagt zich als een
     <video>-element (currentTime, paused, play(), 'timeupdate', ...). Daardoor
     kan de eigen speler (watch.js) met dezelfde code voortgang opslaan,
     hervatten, de intro overslaan en de volgende aflevering starten.
   ========================================================================== */

const API_SRC = "https://www.youtube.com/iframe_api";
const ID_RE = /^[A-Za-z0-9_-]{11}$/;

export function parseYouTubeId(input) {
  const s = String(input || "").trim();
  if (ID_RE.test(s)) return s;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    const host = u.hostname.replace(/^(www|m|music)\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return ID_RE.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      const v = u.searchParams.get("v");
      if (v && ID_RE.test(v)) return v;
      const m = u.pathname.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/);
      if (m) return m[1];
    }
  } catch { /* geen geldige link */ }
  return null;
}

/** Alleen voor echte YouTube-links (geen kale id). Herkent een YouTube-link die onder "Externe link" is gezet. */
export function youTubeIdFromUrl(input) {
  const s = String(input || "").trim();
  return /(^|[/.])(youtube\.com|youtu\.be|youtube-nocookie\.com)(\/|$|\?)/i.test(s) ? parseYouTubeId(s) : null;
}

/** 16:9 voorbeeldplaatje (mqdefault heeft geen zwarte balken). */
export const youTubeThumb = (id) => `https://i.ytimg.com/vi/${id}/mqdefault.jpg`;

export const youTubeErrorText = (code) => `${({
  2: "Deze YouTube-link klopt niet.",
  5: "YouTube kan deze video niet afspelen in deze browser.",
  100: "Deze YouTube-video bestaat niet meer of staat op Privé. Zet hem op 'Niet openbaar vermeld'.",
  101: "De eigenaar van deze video staat inbedden niet toe. Zet 'Inbedden toestaan' aan in YouTube Studio.",
  150: "De eigenaar van deze video staat inbedden niet toe. Zet 'Inbedden toestaan' aan in YouTube Studio.",
  152: "YouTube laat deze video hier niet zien. Controleer of 'Inbedden toestaan' aanstaat en dat de video niet op Privé staat.",
  153: "YouTube weigert de video op deze website (configuratiefout). Ververs met Ctrl + F5. Blijft het zo, zet dan 'Inbedden toestaan' aan in YouTube Studio.",
}[code]) || "De YouTube-video kan niet worden afgespeeld."}${code ? ` (YouTube-fout ${code})` : ""}`;

let apiPromise = null;

export function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(window.YT); };
    const s = document.createElement("script");
    s.src = API_SRC;
    s.async = true;
    s.onerror = () => { apiPromise = null; reject(new Error("YouTube kon niet worden geladen. Controleer je verbinding of zet een adblocker uit.")); };
    document.head.appendChild(s);
    setTimeout(() => { if (!window.YT?.Player) { apiPromise = null; reject(new Error("YouTube reageert niet. Probeer het later opnieuw.")); } }, 15000);
  });
  return apiPromise;
}

const STATE = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 };

export class YouTubeMedia extends EventTarget {
  constructor({ videoId, start = 0, captions = false }) {
    super();
    this._captions = !!captions;
    this.videoId = videoId;
    this.start = Math.max(0, Math.floor(start));
    this.el = document.createElement("div");
    this.el.className = "pl-yt";
    this._mount = document.createElement("div");
    this.el.appendChild(this._mount);
    this._player = null;
    this._paused = true;
    this._ended = false;
    this._seeking = false;
    this._duration = 0;
    this._time = this.start;
    this._loaded = 0;
    this._volume = 1;
    this._muted = false;
    this._rate = 1;
    this._error = null;
    this._poll = null;
    this._seekTimer = null;
    this._g1 = null;
    this._g2 = null;
    this._t0 = performance.now();
    this.log = [];
    this._state = -1;
    this._triedMuted = false;
    this._forcedMute = false;
    this._lastEmit = this.start;
  }

  /* --- Opstarten --------------------------------------------------------------------- */
  async init() {
    const YT = await loadYouTubeApi();
    await new Promise((resolve, reject) => {
      let ready = false;
      this._player = new YT.Player(this._mount, {
        host: "https://www.youtube-nocookie.com", // geen tracking-cookies
        videoId: this.videoId,
        width: "100%",
        height: "100%",
        playerVars: {
          controls: 0,          // eigen bediening
          rel: 0,               // alleen video's van hetzelfde kanaal als "gerelateerd"
          modestbranding: 1,
          iv_load_policy: 3,    // geen pop-up aantekeningen
          disablekb: 1,         // sneltoetsen doet onze speler
          fs: 0,
          playsinline: 1,
          cc_load_policy: 0,
          enablejsapi: 1,
          origin: location.origin,
          start: this.start,
        },
        events: {
          onReady: () => {
            ready = true;
            this._log("speler klaar");
            const p = this._player;
            p.setVolume(Math.round(this._volume * 100));
            this._muted ? p.mute() : p.unMute();
            try { p.setPlaybackRate(this._rate); } catch { /* */ }
            this._applyCaptions();
            this._poll = setInterval(() => this._tick(), 250);
            this._tick();
            resolve();
          },
          onStateChange: (e) => this._onState(e.data),
          onPlaybackRateChange: () => { this._rate = this._player.getPlaybackRate(); this.dispatchEvent(new Event("ratechange")); },
          onError: (e) => {
            this._log(`FOUT ${e.data}`);
            this._error = { code: e.data };
            this.dispatchEvent(new Event("error"));
            if (!ready) reject(new Error(youTubeErrorText(e.data)));
          },
        },
      });
    });
  }

  /* --- Gebeurtenissen van YouTube vertalen naar <video>-gebeurtenissen ---------------- */
  _emit(name) { this._log(`event ${name}`); this.dispatchEvent(new Event(name)); }

  /** Korte log voor de diagnose in de speler (?debug=1 of drie keer op de titel tikken). */
  _log(msg) {
    if (/^event (timeupdate|progress|durationchange|volumechange|ratechange)$/.test(msg)) return;
    this.log.push(`${((performance.now() - this._t0) / 1000).toFixed(1)}s ${msg}`);
    if (this.log.length > 16) this.log.shift();
  }

  _onState(s) {
    this._state = s;
    this._log(`YouTube-staat ${s}`);
    if (s === STATE.PLAYING) {
      clearTimeout(this._g1); clearTimeout(this._g2);
      const wasPaused = this._paused;
      this._emit("autoplayok");
      if (this._forcedMute) this._tryUnmute();
      if (!this._captions) this._applyCaptions(); // YouTube zet ondertiteling soms pas na de start aan
      this._paused = false;
      this._ended = false;
      if (wasPaused) this._emit("play");
      this._emit("playing");
      this._emit("canplay");
      this._endSeek();
    } else if (s === STATE.PAUSED) {
      if (!this._paused) { this._paused = true; this._emit("pause"); }
      this._endSeek();
    } else if (s === STATE.ENDED) {
      this._paused = true;
      this._ended = true;
      this._time = this._duration || this._time;
      this._emit("timeupdate");
      this._emit("pause");
      this._emit("ended");
    } else if (s === STATE.BUFFERING) {
      this._emit("waiting");
    } else if (s === STATE.CUED) {
      this._tick();
    }
  }

  _endSeek() {
    clearTimeout(this._seekTimer);
    if (this._seeking) { this._seeking = false; this._emit("seeked"); }
  }

  /** YouTube heeft geen timeupdate-gebeurtenis, dus elke 250 ms de stand opvragen. */
  _tick() {
    const p = this._player;
    if (!p || typeof p.getDuration !== "function") return;
    const d = p.getDuration() || 0;
    if (d > 0 && d !== this._duration) {
      const first = !this._duration;
      this._duration = d;
      if (first) this._emit("loadedmetadata");
      this._emit("durationchange");
    }
    if (!this._seeking) this._time = p.getCurrentTime() || 0;
    const loaded = p.getVideoLoadedFraction?.() || 0;
    if (loaded !== this._loaded) { this._loaded = loaded; this._emit("progress"); }
    if (!this._paused || Math.abs(this._time - this._lastEmit) > 0.05) this._emit("timeupdate");
    this._lastEmit = this._time;
  }

  /**
   * Ondertiteling (standaard uit). De captions-module is niet officieel gedocumenteerd
   * en kan dus een keer veranderen; daarom altijd in een try/catch.
   */
  setCaptions(on) { this._captions = !!on; this._applyCaptions(); }
  get captions() { return this._captions; }
  _applyCaptions() {
    const p = this._player;
    if (!p) return;
    try {
      if (this._captions) {
        p.loadModule?.("captions");
        const list = p.getOption?.("captions", "tracklist") || [];
        const nl = list.find((t) => /^nl/i.test(t.languageCode || ""));
        if (nl) p.setOption?.("captions", "track", { languageCode: nl.languageCode });
      } else {
        p.unloadModule?.("captions");
        p.unloadModule?.("cc");
      }
    } catch { /* module bestaat niet (meer): niet erg */ }
  }

  /* --- Zelfde eigenschappen als een <video>-element ------------------------------------ */
  get currentTime() { return this._time; }
  set currentTime(t) {
    t = Math.max(0, Math.min(t, this._duration || t));
    this._time = t;
    this._seeking = true;
    this._emit("seeking");
    this._player?.seekTo(t, true);
    clearTimeout(this._seekTimer);
    this._seekTimer = setTimeout(() => this._endSeek(), 1500); // vangnet als YouTube geen statuswijziging meldt
    this._emit("timeupdate");
  }
  get duration() { return this._duration || NaN; }
  get paused() { return this._paused; }
  get ended() { return this._ended; }
  get seeking() { return this._seeking; }
  get error() { return this._error; }
  get buffered() {
    const end = this._loaded * (this._duration || 0);
    return { length: end > 0 ? 1 : 0, start: () => 0, end: () => end };
  }
  get volume() { return this._volume; }
  set volume(x) { this._volume = Math.max(0, Math.min(1, x)); this._player?.setVolume?.(Math.round(this._volume * 100)); this._emit("volumechange"); }
  get muted() { try { if (this._player?.isMuted?.()) return true; } catch { /* */ } return this._muted; }
  set muted(m) { this._muted = !!m; if (this._player?.mute) (this._muted ? this._player.mute() : this._player.unMute()); this._emit("volumechange"); }
  get playbackRate() { return this._rate; }
  set playbackRate(r) { this._rate = r; this._player?.setPlaybackRate?.(r); this._emit("ratechange"); }

  /**
   * Starten zonder dat de kijker nog eens hoeft te tikken:
   * 1. gewoon proberen (met geluid), 2. lukt dat niet: gedempt starten (mag overal) en daarna
   * het geluid proberen aan te zetten, 3. lukt niets: YouTube's eigen knop tikbaar maken.
   */
  play() {
    this._player?.playVideo();
    clearTimeout(this._g1); clearTimeout(this._g2);
    this._g1 = setTimeout(() => {
      // Nog niet gestart (ook "laden" telt mee: bij geblokkeerd afspelen blijft YouTube soms eindeloos op laden staan)
      if (!this._paused || this._triedMuted) return;
      this._log("niet gestart na 1,5 s: gedempt proberen");
      this._triedMuted = true;
      this._forcedMute = true;
      try { this._player.mute(); this._player.playVideo(); } catch { /* */ }
    }, 1500);
    this._g2 = setTimeout(() => {
      if (!this._paused) return;
      this._log("niet gestart na 6 s: YouTube's eigen knop tonen");
      this._emit("canplay");
      this._emit("autoplayblocked"); // de kijker moet zelf op YouTube's afspeelknop tikken
    }, 6000);
    return Promise.resolve();
  }

  /** Na gedempt starten: geluid weer aanzetten als de browser dat toestaat, anders de kijker laten tikken. */
  _tryUnmute() {
    this._forcedMute = false;
    if (this._muted) return; // de kijker wilde het geluid uit
    try { this._player.unMute(); } catch { /* */ }
    setTimeout(() => {
      let stillMuted = false;
      try { stillMuted = this._player.isMuted(); } catch { /* */ }
      this._log(`geluid terugzetten: ${stillMuted ? "mislukt (kijker moet tikken)" : "gelukt"}`);
      if (stillMuted) { this._emit("needsound"); this._emit("volumechange"); }
    }, 700);
  }
  pause() { this._player?.pauseVideo(); }

  /** Alleen de YouTube-speler afbreken (voor opnieuw proberen). */
  _teardown() {
    clearInterval(this._poll);
    clearTimeout(this._seekTimer);
    clearTimeout(this._g1); clearTimeout(this._g2);
    this._triedMuted = false; this._forcedMute = false; this._state = -1;
    try { this._player?.destroy(); } catch { /* */ }
    this._player = null;
    this._paused = true; this._ended = false; this._seeking = false; this._error = null; this._duration = 0;
    this.el.replaceChildren();
  }

  /** Opnieuw beginnen, bijvoorbeeld na een fout. */
  async reload() {
    this._teardown();
    this._mount = document.createElement("div");
    this.el.appendChild(this._mount);
    await this.init();
  }

  destroy() {
    this._teardown();
    this.el.remove();
  }
}
