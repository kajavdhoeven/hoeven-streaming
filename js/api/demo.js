/* ==========================================================================
   Hoeven+  -  demo-backend
   Wordt gebruikt zolang config.js geen Supabase-gegevens heeft. Alles wordt
   in de localStorage van je browser bewaard. Dezelfde interface als supabase.js,
   dus het hele platform (ook de Studio) is uit te proberen.
   ========================================================================== */

import { uid } from "../ui/format.js";

const KEY = "hp:demo:v1";
const SESSION_KEY = "hp:demo:session";
const DAY = 86400000;

/* ------------------------------ Gegenereerde artwork ------------------------------ */

const svgUri = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function wrapWords(text, max) {
  const lines = []; let line = "";
  for (const w of text.split(" ")) {
    if ((line + " " + w).trim().length > max && line) { lines.push(line); line = w; } else line = (line + " " + w).trim();
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function shapes(a, b, seed, w, h) {
  const r = (n) => { const x = Math.sin(seed * 999 + n * 77) * 10000; return x - Math.floor(x); };
  return `
    <circle cx="${w * (0.15 + r(1) * 0.7)}" cy="${h * (0.1 + r(2) * 0.5)}" r="${w * (0.28 + r(3) * 0.25)}" fill="url(#g2)" opacity=".55"/>
    <circle cx="${w * (0.2 + r(4) * 0.7)}" cy="${h * (0.4 + r(5) * 0.5)}" r="${w * (0.2 + r(6) * 0.3)}" fill="#fff" opacity=".07"/>
    <circle cx="${w * (0.6 + r(7) * 0.4)}" cy="${h * r(8)}" r="${w * (0.1 + r(9) * 0.15)}" fill="#000" opacity=".16"/>`;
}

function poster(title, [a, b], seed) {
  const lines = wrapWords(title, 13);
  const text = lines.map((l, i) => `<text x="44" y="${690 + i * 66}" font-family="Poppins, Segoe UI, Arial, sans-serif" font-weight="800" font-size="58" fill="#fff" letter-spacing="-1">${esc(l)}</text>`).join("");
  const off = (lines.length - 1) * 66;
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 900" width="600" height="900">
    <defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
    <linearGradient id="g2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="${a}"/></linearGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".78"/></linearGradient></defs>
    <rect width="600" height="900" fill="url(#g1)"/>${shapes(a, b, seed, 600, 900)}
    <rect width="600" height="900" fill="url(#fade)"/>
    <g transform="translate(0,${-off})">${text}</g>
    <text x="44" y="70" font-family="Poppins, Segoe UI, Arial, sans-serif" font-weight="700" font-size="30" fill="#fff" opacity=".9">Hoeven+</text></svg>`);
}

function backdrop([a, b], seed) {
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">
    <defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
    <linearGradient id="g2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="${a}"/></linearGradient></defs>
    <rect width="1600" height="900" fill="url(#g1)"/>${shapes(a, b, seed, 1600, 900)}${shapes(b, a, seed + 3, 1600, 900)}</svg>`);
}

function thumb([a, b], seed, label) {
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
    <defs><linearGradient id="g1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
    <linearGradient id="g2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="${a}"/></linearGradient></defs>
    <rect width="640" height="360" fill="url(#g1)"/>${shapes(a, b, seed, 640, 360)}
    <text x="320" y="215" text-anchor="middle" font-family="Poppins, Segoe UI, Arial, sans-serif" font-weight="800" font-size="120" fill="#fff" opacity=".85">${esc(String(label))}</text></svg>`);
}

/* ------------------------------ Voorbeelddata ------------------------------ */

const PAL = [["#2fbdf5", "#3f58c6"], ["#8b4ea2", "#d94a72"], ["#f0492a", "#fbbf24"], ["#10b981", "#2fbdf5"], ["#3f58c6", "#8b4ea2"], ["#d94a72", "#f0492a"], ["#0ea5e9", "#6366f1"], ["#f59e0b", "#ef4444"], ["#14b8a6", "#3b82f6"], ["#a855f7", "#ec4899"]];

function seedData() {
  const now = Date.now();
  const T = [];
  const V = [];
  let n = 0;
  function title(id, kind, name, opts, eps) {
    const pal = PAL[n % PAL.length];
    n++;
    T.push({
      id, kind, title: name, tagline: opts.tagline || "", description: opts.description, year: opts.year || 2025,
      genres: opts.genres || [], rating: opts.rating || "AL", poster_path: poster(name, pal, n), backdrop_path: backdrop(pal, n),
      status: opts.status || "published", release_at: opts.release_at || null, featured: !!opts.featured, show_on_landing: opts.status !== "draft" && opts.status !== "coming_soon" && !opts.private,
      created_by: "demo-user", created_at: new Date(now - (20 - n) * DAY).toISOString(), updated_at: new Date(now - (20 - n) * DAY).toISOString(),
    });
    eps.forEach((e, i) => V.push({
      id: `${id}-v${i + 1}`, title_id: id, season: 1, episode: i + 1, name: e[0], description: e[1] || "",
      thumb_path: thumb(pal, n + i, kind === "series" ? i + 1 : "▶"), source: "storage", video_path: "demo:sample",
      duration_seconds: e[2] || 1500 + i * 210, intro_start: kind === "series" ? 3 : null, intro_end: kind === "series" ? 9 : null,
      created_at: new Date(now - (20 - n) * DAY).toISOString(),
    }));
  }

  title("t-oude-dagen", "series", "Oude Dagen", {
    tagline: "Herinneringen die nooit oud worden", featured: true, genres: ["Familie", "Documentaire"], year: 2024,
    description: "Een liefdevolle reis door tientallen jaren familiebeelden: van de eerste stapjes tot lange zomeravonden in de tuin. Kijk mee naar de momenten die alles samen maken.",
  }, [["De eerste stapjes", "Waar het allemaal begon: de allereerste beelden van thuis.", 1620], ["Het huis aan de dijk", "Een rondleiding door het huis waar zoveel gebeurde.", 1710], ["Zomer in de tuin", "Lange dagen, koude drankjes en veel gelach.", 1580]]);

  title("t-thuisjournaal", "series", "Het Thuisjournaal", {
    tagline: "Live vanaf de bank", genres: ["Humor", "Jeugd"], year: 2025,
    description: "Het enige nieuwsprogramma dat elke aflevering anders klinkt. Met scherpe verslaggeving, onverwachte interviews en een weerbericht dat nergens op slaat.",
  }, [["Nieuwslezers in wording", "De eerste uitzending. Alles gaat mis, en dat is precies de bedoeling.", 720], ["Live vanaf de bank", "Een reportage van ver weg: de keuken.", 840], ["Het weerbericht", "Zon, regen, en een onverwachte hagelbui.", 690]]);

  title("t-the-way", "movie", "The Way", {
    tagline: "Een kleine jongen, een groot strand", genres: ["Avontuur", "Familie"], rating: "6", year: 2023,
    description: "Een dag aan zee, een vuurtoren aan de horizon en een zandkasteel dat steeds groter wordt. Een kort verhaal over ontdekken.",
  }, [["The Way", "", 2160]]);

  title("t-kampvuur", "movie", "Kampvuuravond 2025", {
    tagline: "Live muziek onder de sterren", featured: true, genres: ["Muziek", "Live"], year: 2025,
    description: "Een avond bij het kampvuur met live muziek van The Bowery. Akoestisch, warm en met precies genoeg meezingers.",
  }, [["Volledig optreden", "", 3900]]);

  title("t-zeeland", "movie", "Zomer in Zeeland", {
    tagline: "Zon, zee en te veel ijs", genres: ["Vakantie", "Natuur"], year: 2025,
    description: "Een week aan de Zeeuwse kust: fietsen langs de dijk, mosselen eten en de zonsondergang die elke avond beter lijkt.",
  }, [["Zomer in Zeeland", "", 2940]]);

  title("t-sinterklaas", "movie", "Sinterklaasavond 2024", {
    tagline: "Pakjesavond in beeld", genres: ["Feest", "Familie"], year: 2024,
    description: "De surprises, de gedichten en de pepernoten: alles wat pakjesavond bij ons zo bijzonder maakt.",
  }, [["Sinterklaasavond 2024", "", 2400]]);

  title("t-sprint", "movie", "Sprint!", {
    tagline: "Elke honderdste telt", genres: ["Sport"], year: 2025,
    description: "De beste races, de snelste starts en de zenuwen vlak voor het startsignaal. Een seizoen zwemmen in twintig minuten.",
  }, [["Sprint!", "", 1260]]);

  title("t-fietstocht", "movie", "Nachtelijke Fietstocht", {
    tagline: "Nooit zonder lampje", genres: ["Avontuur"], rating: "12", year: 2024,
    description: "Een spontane tocht door het donker, met een verdwaalde route en een onverwacht mooi eindpunt.",
  }, [["Nachtelijke Fietstocht", "", 1980]]);

  title("t-rotterdam", "movie", "Dagje Rotterdam", {
    tagline: "Van de Markthal tot de Maas", genres: ["Reizen"], rating: "AL", year: 2025,
    description: "Een dagje de stad in: architectuur, straatvoedsel en een waterbus die net wel én net niet op tijd was.",
  }, [["Dagje Rotterdam", "", 1800]]);

  title("t-ski", "series", "Skivakantie", {
    tagline: "Van pistes en chocolademelk", genres: ["Vakantie", "Sport"], status: "coming_soon", release_at: new Date(now + 12 * DAY).toISOString(), year: 2026,
    description: "Vier afleveringen sneeuw, valpartijen en warme chocolademelk. Binnenkort te zien.",
  }, [["Aankomst", "", 1500], ["De eerste dag", "", 1600], ["Sneeuwstorm", "", 1400], ["Terug naar huis", "", 1300]]);

  title("t-diner", "movie", "Het Grote Familiediner", {
    tagline: "Iedereen aan tafel", genres: ["Familie", "Feest"], status: "coming_soon", release_at: new Date(now + 30 * DAY).toISOString(), year: 2026,
    description: "Eén grote tafel, veel te veel eten en alle verhalen die daarbij horen.",
  }, [["Het Grote Familiediner", "", 3300]]);

  title("t-backstage", "series", "Achter de schermen", {
    genres: ["Documentaire"], status: "draft", year: 2026,
    description: "Een kijkje achter de schermen van Hoeven+. Nog in de maak.",
  }, [["Aflevering 1", "", 900]]);

  const rows = [
    { id: "r-nieuw", name: "Nieuw op Hoeven+", position: 0, visible: true, items: ["t-zeeland", "t-sinterklaas", "t-kampvuur", "t-sprint", "t-the-way", "t-rotterdam"] },
    { id: "r-familie", name: "Familieherinneringen", position: 1, visible: true, items: ["t-oude-dagen", "t-thuisjournaal", "t-sinterklaas", "t-the-way"] },
    { id: "r-reizen", name: "Vakantie & Reizen", position: 2, visible: true, items: ["t-zeeland", "t-rotterdam", "t-fietstocht"] },
    { id: "r-muziek", name: "Muziek & Live", position: 3, visible: true, items: ["t-kampvuur"] },
  ];

  const profiles = [
    { id: "p-kaja", owner_id: "demo-user", name: "Kaja", avatar_color: "c1", avatar_emoji: "🦊", is_kids: false, created_at: new Date(now - 30 * DAY).toISOString() },
    { id: "p-gast", owner_id: "demo-user", name: "Gast", avatar_color: "c4", avatar_emoji: "😎", is_kids: false, created_at: new Date(now - 29 * DAY).toISOString() },
    { id: "p-kids", owner_id: "demo-user", name: "Kids", avatar_color: "c6", avatar_emoji: "🐣", is_kids: true, created_at: new Date(now - 28 * DAY).toISOString() },
  ];

  const members = [
    { id: "demo-user", email: "kaja@voorbeeld.nl", display_name: "Kaja", role: "admin", approved: true, created_at: new Date(now - 40 * DAY).toISOString() },
    { id: "m-2", email: "opa@voorbeeld.nl", display_name: "Opa Jan", role: "member", approved: true, created_at: new Date(now - 25 * DAY).toISOString() },
    { id: "m-3", email: "tante.els@voorbeeld.nl", display_name: "Tante Els", role: "member", approved: true, created_at: new Date(now - 18 * DAY).toISOString() },
    { id: "m-4", email: "vriend@voorbeeld.nl", display_name: "Sem", role: "member", approved: false, created_at: new Date(now - 1 * DAY).toISOString() },
  ];

  const progress = {
    "p-kaja": [
      { video_id: "t-oude-dagen-v1", title_id: "t-oude-dagen", position_seconds: 17, duration_seconds: 45, completed: false, updated_at: new Date(now - 3600000).toISOString() },
      { video_id: "t-kampvuur-v1", title_id: "t-kampvuur", position_seconds: 28, duration_seconds: 45, completed: false, updated_at: new Date(now - 26 * 3600000).toISOString() },
      { video_id: "t-thuisjournaal-v1", title_id: "t-thuisjournaal", position_seconds: 44, duration_seconds: 45, completed: true, updated_at: new Date(now - 50 * 3600000).toISOString() },
    ],
  };
  const mylist = { "p-kaja": ["t-zeeland", "t-sprint"] };

  // Nep-statistieken voor het dashboard (deterministisch)
  const watch_daily = [];
  const pubVideos = V.filter((v) => T.find((t) => t.id === v.title_id).status === "published");
  for (let d = 0; d < 30; d++) {
    const day = new Date(now - d * DAY).toISOString().slice(0, 10);
    const count = 1 + Math.floor(Math.abs(Math.sin(d * 3.7)) * 4);
    for (let k = 0; k < count; k++) {
      const v = pubVideos[Math.floor(Math.abs(Math.sin(d * 13 + k * 7)) * pubVideos.length) % pubVideos.length];
      const p = profiles[(d + k) % profiles.length];
      watch_daily.push({ profile_id: p.id, video_id: v.id, title_id: v.title_id, day, seconds: 300 + Math.floor(Math.abs(Math.sin(d + k)) * 2400) });
    }
  }

  return {
    titles: T, videos: V, rows, profiles, members, progress, mylist, watch_daily,
    settings: { announcement: { enabled: false, text: "" }, site: { name: "Hoeven+" } },
  };
}

/* ------------------------------ Backend ------------------------------ */

export function create() {
  let db;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
  if (!db) db = seedData();

  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* opslag vol: niet erg */ } };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));
  const blobs = new Map();
  const listeners = new Set();
  const me = () => db.members.find((m) => m.id === "demo-user");

  const api = {
    mode: "demo",

    auth: {
      async init() { return localStorage.getItem(SESSION_KEY) ? clone(me()) : null; },
      async refreshMember() { return clone(me()); },
      async signIn(email) {
        await delay(700);
        localStorage.setItem(SESSION_KEY, "1");
        return clone(me());
      },
      async signUp(email, password, name) {
        await delay(900);
        localStorage.setItem(SESSION_KEY, "1");
        if (name) { me().display_name = name; persist(); }
        return { member: clone(me()), needsConfirmation: false };
      },
      async signOut() { localStorage.removeItem(SESSION_KEY); },
      async resetPassword() { await delay(700); },
      async updatePassword() { await delay(500); },
      onEvent(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    },

    profiles: {
      async list() { await delay(); return clone(db.profiles); },
      async create(p, ownerId) {
        if (db.profiles.length >= 5) throw new Error("Je kunt maximaal 5 profielen per account maken.");
        const row = { id: uid(), owner_id: ownerId, created_at: new Date().toISOString(), ...p };
        db.profiles.push(row); persist(); return clone(row);
      },
      async update(id, patch) { const p = db.profiles.find((x) => x.id === id); Object.assign(p, patch); persist(); return clone(p); },
      async remove(id) {
        db.profiles = db.profiles.filter((x) => x.id !== id);
        delete db.progress[id]; delete db.mylist[id]; persist();
      },
    },

    catalog: {
      async load() {
        await delay(250);
        return clone({ titles: db.titles, videos: db.videos, rows: [...db.rows].sort((a, b) => a.position - b.position) });
      },
    },

    media: {
      artwork(path) { return path || null; },
      async video(v) {
        const p = v.video_path;
        if (p.startsWith("blob:")) return { url: p, type: "mp4" };
        if (p.startsWith("demo:")) {
          const probe = document.createElement("video");
          const mp4 = probe.canPlayType('video/mp4; codecs="avc1.42E01E"');
          return { url: new URL(mp4 ? "demo/sample.mp4" : "demo/sample.webm", document.baseURI).href, type: "mp4" };
        }
        return { url: p, type: /\.m3u8(\?|$)/i.test(p) ? "hls" : "mp4" };
      },
    },

    landing: {
      async showcase() {
        await delay(150);
        return clone(db.titles.filter((t) => t.status === "published" && t.show_on_landing && t.poster_path)
          .sort((a, b) => (b.featured - a.featured) || (new Date(b.created_at) - new Date(a.created_at))).slice(0, 12)
          .map(({ id, title, kind, year, genres, poster_path }) => ({ id, title, kind, year, genres, poster_path })));
      },
    },

    userdata: {
      async progress(profileId) { return clone(db.progress[profileId] || []); },
      async saveProgress({ profileId, videoId, titleId, position, duration, delta }) {
        const list = (db.progress[profileId] ||= []);
        let r = list.find((x) => x.video_id === videoId);
        if (!r) { r = { video_id: videoId, title_id: titleId }; list.push(r); }
        Object.assign(r, { position_seconds: position, duration_seconds: duration, completed: duration > 0 && position >= duration * 0.95, updated_at: new Date().toISOString() });
        if (delta > 0) {
          const day = new Date().toISOString().slice(0, 10);
          let w = db.watch_daily.find((x) => x.profile_id === profileId && x.video_id === videoId && x.day === day);
          if (!w) { w = { profile_id: profileId, video_id: videoId, title_id: titleId, day, seconds: 0 }; db.watch_daily.push(w); }
          w.seconds += Math.min(delta, 120);
        }
        persist();
      },
      async removeProgress(profileId, titleId) {
        db.progress[profileId] = (db.progress[profileId] || []).filter((r) => r.title_id !== titleId); persist();
      },
      async myList(profileId) { return clone(db.mylist[profileId] || []); },
      async setMyList(profileId, titleId, on) {
        const set = new Set(db.mylist[profileId] || []);
        on ? set.add(titleId) : set.delete(titleId);
        db.mylist[profileId] = [...set]; persist();
      },
    },

    settings: {
      async get() { return clone(db.settings); },
      async set(key, value) { db.settings[key] = value; persist(); },
    },

    studio: {
      titles: {
        async save(t) {
          await delay(200);
          const now = new Date().toISOString();
          if (t.id) { const cur = db.titles.find((x) => x.id === t.id); Object.assign(cur, t, { updated_at: now }); persist(); return clone(cur); }
          const row = { id: uid(), created_by: "demo-user", created_at: now, updated_at: now, ...t };
          db.titles.unshift(row); persist(); return clone(row);
        },
        async remove(id) {
          db.titles = db.titles.filter((t) => t.id !== id);
          db.videos = db.videos.filter((v) => v.title_id !== id);
          db.rows.forEach((r) => (r.items = r.items.filter((i) => i !== id)));
          persist();
        },
      },
      videos: {
        async save(v) {
          await delay(200);
          if (v.id) { const cur = db.videos.find((x) => x.id === v.id); Object.assign(cur, v); persist(); return clone(cur); }
          const row = { id: uid(), created_at: new Date().toISOString(), ...v };
          db.videos.push(row); persist(); return clone(row);
        },
        async remove(id) { db.videos = db.videos.filter((v) => v.id !== id); persist(); },
      },
      rows: {
        async save(r) {
          if (r.id) { const cur = db.rows.find((x) => x.id === r.id); Object.assign(cur, r); persist(); return clone(cur); }
          const row = { id: uid(), items: [], position: db.rows.length, visible: true, ...r };
          db.rows.push(row); persist(); return clone(row);
        },
        async remove(id) { db.rows = db.rows.filter((r) => r.id !== id); persist(); },
        async setItems(rowId, ids) { db.rows.find((r) => r.id === rowId).items = [...ids]; persist(); },
        async reorder(ids) { ids.forEach((id, i) => (db.rows.find((r) => r.id === id).position = i)); persist(); },
      },
      members: {
        async list() { await delay(); return clone(db.members); },
        async update(id, patch) { const m = db.members.find((x) => x.id === id); Object.assign(m, patch); persist(); return clone(m); },
        async remove(id) { db.members = db.members.filter((m) => m.id !== id); persist(); },
      },
      async stats() {
        await delay(250);
        return clone({ members: db.members, profiles: db.profiles, watch_daily: db.watch_daily, watch_progress: Object.entries(db.progress).flatMap(([pid, l]) => l.map((r) => ({ ...r, profile_id: pid }))) });
      },

      async upload(bucket, file, { onProgress, signal } = {}) {
        const total = file.size || 1;
        const steps = bucket === "videos" ? 24 : 8;
        for (let i = 1; i <= steps; i++) {
          await delay(bucket === "videos" ? 90 : 40);
          if (signal?.aborted) throw new DOMException("Upload geannuleerd", "AbortError");
          onProgress?.(i / steps, (total * i) / steps, total);
        }
        if (bucket === "videos") {
          const url = URL.createObjectURL(file);
          blobs.set(url, file);
          return { path: url };
        }
        // Artwork: verkleinen en als data-URL bewaren zodat het een herlaad overleeft
        const bmp = await createImageBitmap(file);
        const scale = Math.min(1, 1280 / bmp.width);
        const c = document.createElement("canvas");
        c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
        c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
        return { path: c.toDataURL("image/jpeg", 0.8) };
      },
      async removeFiles() { /* niets te doen in demo */ },
    },
  };
  return api;
}
