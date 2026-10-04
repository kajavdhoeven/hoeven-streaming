/* ==========================================================================
   Hoeven+  -  Supabase-backend
   Zelfde interface als demo.js. Zie README voor het overzicht van de API.
   ========================================================================== */

import { CONFIG } from "../config.js";
import { safeFileName, uid } from "../ui/format.js";

const ERRORS = [
  [/Invalid login credentials/i, "E-mailadres of wachtwoord klopt niet."],
  [/Email not confirmed/i, "Bevestig eerst je e-mailadres via de mail die je hebt gekregen."],
  [/User already registered/i, "Er bestaat al een account met dit e-mailadres."],
  [/Password should be at least/i, "Kies een wachtwoord van minimaal 6 tekens."],
  [/rate limit|too many/i, "Te veel pogingen. Probeer het over een paar minuten opnieuw."],
  [/Maximaal 5 profielen/i, "Je kunt maximaal 5 profielen per account maken."],
  [/videos_source_check/i, "De database kent YouTube nog niet. Plak supabase/updates.sql in de SQL Editor van Supabase en klik op Run."],
  [/Failed to fetch|NetworkError|Load failed/i, "Geen verbinding met de server. Controleer je internet."],
  [/row-level security|permission denied|Geen toegang/i, "Je hebt hier geen toegang toe."],
  [/Bucket not found/i, "Opslag-bucket niet gevonden. Heb je schema.sql helemaal uitgevoerd?"],
  [/exceeded the maximum allowed size|Payload too large|too large/i, "Dit bestand is te groot voor je Supabase-plan (gratis: 50 MB). Gebruik een externe link voor grote video's."],
];

function friendly(error) {
  const msg = error?.message || String(error);
  for (const [re, text] of ERRORS) if (re.test(msg)) return text;
  return msg;
}

function unwrap({ data, error }) {
  if (error) {
    const e = new Error(friendly(error));
    e.original = error;
    throw e;
  }
  return data;
}

export function create() {
  const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
  });
  const base = CONFIG.SUPABASE_URL.replace(/\/+$/, "");

  async function fetchMember(user) {
    if (!user) return null;
    const { data, error } = await sb.from("members").select("*").eq("id", user.id).maybeSingle();
    if (error) throw new Error(friendly(error));
    return data;
  }

  const api = {
    mode: "supabase",

    /* ------------------------------ Account ------------------------------ */
    auth: {
      async init() {
        const { data } = await sb.auth.getSession();
        return fetchMember(data.session?.user);
      },
      async refreshMember() {
        const { data } = await sb.auth.getUser();
        return fetchMember(data.user);
      },
      async signIn(email, password) {
        const data = unwrap(await sb.auth.signInWithPassword({ email, password }));
        return fetchMember(data.user);
      },
      async signUp(email, password, displayName) {
        const data = unwrap(await sb.auth.signUp({
          email, password,
          options: { data: { display_name: displayName }, emailRedirectTo: `${location.origin}/` },
        }));
        // Zonder sessie moet het e-mailadres eerst bevestigd worden.
        if (!data.session) return { member: null, needsConfirmation: true };
        return { member: await fetchMember(data.user), needsConfirmation: false };
      },
      async signOut() { await sb.auth.signOut(); },
      async resetPassword(email) {
        unwrap(await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/` }));
      },
      async updatePassword(password) { unwrap(await sb.auth.updateUser({ password })); },
      onEvent(cb) {
        // Niet direct supabase aanroepen binnen deze callback (kan vastlopen), dus altijd uitstellen.
        const { data } = sb.auth.onAuthStateChange((event) => setTimeout(() => cb(event), 0));
        return () => data.subscription.unsubscribe();
      },
    },

    /* ------------------------------ Profielen ---------------------------- */
    profiles: {
      async list() {
        return unwrap(await sb.from("profiles").select("*").order("created_at"));
      },
      async create({ name, avatar_color, avatar_emoji, is_kids }, ownerId) {
        return unwrap(await sb.from("profiles").insert({ name, avatar_color, avatar_emoji, is_kids, owner_id: ownerId }).select().single());
      },
      async update(id, patch) {
        return unwrap(await sb.from("profiles").update(patch).eq("id", id).select().single());
      },
      async remove(id) { unwrap(await sb.from("profiles").delete().eq("id", id)); },
    },

    /* ------------------------------ Catalogus ---------------------------- */
    catalog: {
      async load() {
        const [titles, videos, rows] = await Promise.all([
          sb.from("titles").select("*").order("created_at", { ascending: false }),
          sb.from("videos").select("*").order("season").order("episode"),
          sb.from("rows").select("*, row_items(title_id, position)").order("position"),
        ]);
        return {
          titles: unwrap(titles),
          videos: unwrap(videos),
          rows: unwrap(rows).map(({ row_items, ...r }) => ({
            ...r,
            items: (row_items || []).sort((a, b) => a.position - b.position).map((i) => i.title_id),
          })),
        };
      },
    },

    media: {
      artwork(path) {
        if (!path) return null;
        if (/^(https?:|data:|blob:)/.test(path)) return path;
        return `${base}/storage/v1/object/public/artwork/${path.split("/").map(encodeURIComponent).join("/")}`;
      },
      async video(v) {
        if (v.source === "url") {
          return { url: v.video_path, type: /\.m3u8(\?|$)/i.test(v.video_path) ? "hls" : "mp4" };
        }
        const { data, error } = await sb.storage.from("videos").createSignedUrl(v.video_path, 6 * 3600);
        if (error) throw new Error(friendly(error));
        return { url: data.signedUrl, type: "mp4" };
      },
    },

    /** Openbare voorpagina (werkt ook zonder inloggen). */
    landing: {
      async showcase() {
        const { data, error } = await sb.rpc("public_showcase");
        if (error) { console.warn("Voorpagina-titels niet geladen (is update-landing.sql uitgevoerd?):", error.message); return []; }
        return data || [];
      },
    },

    /* --------------------------- Voortgang & lijst ------------------------ */
    userdata: {
      async progress(profileId) {
        return unwrap(await sb.from("watch_progress").select("*").eq("profile_id", profileId));
      },
      async saveProgress({ profileId, videoId, titleId, position, duration, delta }) {
        unwrap(await sb.rpc("save_progress", {
          p_profile: profileId, p_video: videoId, p_title: titleId,
          p_position: Math.round(position * 10) / 10, p_duration: Math.round(duration * 10) / 10, p_delta: Math.round(delta || 0),
        }));
      },
      async removeProgress(profileId, titleId) {
        unwrap(await sb.from("watch_progress").delete().eq("profile_id", profileId).eq("title_id", titleId));
      },
      async myList(profileId) {
        return unwrap(await sb.from("my_list").select("title_id, created_at").eq("profile_id", profileId).order("created_at", { ascending: false })).map((r) => r.title_id);
      },
      async setMyList(profileId, titleId, on) {
        if (on) unwrap(await sb.from("my_list").upsert({ profile_id: profileId, title_id: titleId }));
        else unwrap(await sb.from("my_list").delete().eq("profile_id", profileId).eq("title_id", titleId));
      },
    },

    settings: {
      async get() {
        const rows = unwrap(await sb.from("settings").select("*"));
        return Object.fromEntries(rows.map((r) => [r.key, r.value]));
      },
      async set(key, value) { unwrap(await sb.from("settings").upsert({ key, value })); },
    },

    /* ------------------------------- Studio ------------------------------- */
    studio: {
      titles: {
        async save(t) {
          const { id, ...fields } = t;
          delete fields.created_at; delete fields.updated_at;
          const run = async (f) => {
            if (id) return sb.from("titles").update(f).eq("id", id).select().single();
            const { data: u } = await sb.auth.getUser();
            return sb.from("titles").insert({ ...f, created_by: u.user?.id }).select().single();
          };
          let res = await run(fields);
          // Kolom ontbreekt nog (updates.sql niet gedraaid)? Opslaan zonder dat veld.
          for (const col of ["show_on_landing", "is_new"]) {
            if (res.error && res.error.message.includes(col) && col in fields) {
              delete fields[col];
              res = await run(fields);
            }
          }
          return unwrap(res);
        },
        async remove(id) { unwrap(await sb.from("titles").delete().eq("id", id)); },
      },
      videos: {
        async save(v) {
          const { id, ...fields } = v;
          delete fields.created_at;
          if (id) return unwrap(await sb.from("videos").update(fields).eq("id", id).select().single());
          return unwrap(await sb.from("videos").insert(fields).select().single());
        },
        async remove(id) { unwrap(await sb.from("videos").delete().eq("id", id)); },
      },
      rows: {
        async save(r) {
          const { id, items, ...fields } = r;
          if (id) return { ...unwrap(await sb.from("rows").update(fields).eq("id", id).select().single()), items };
          return { ...unwrap(await sb.from("rows").insert(fields).select().single()), items: [] };
        },
        async remove(id) { unwrap(await sb.from("rows").delete().eq("id", id)); },
        async setItems(rowId, titleIds) {
          unwrap(await sb.from("row_items").delete().eq("row_id", rowId));
          if (titleIds.length) {
            unwrap(await sb.from("row_items").insert(titleIds.map((title_id, position) => ({ row_id: rowId, title_id, position }))));
          }
        },
        async reorder(ids) {
          await Promise.all(ids.map((id, position) => sb.from("rows").update({ position }).eq("id", id).then(unwrap)));
        },
      },
      members: {
        async list() { return unwrap(await sb.from("members").select("*").order("created_at")); },
        async update(id, patch) { return unwrap(await sb.from("members").update(patch).eq("id", id).select().single()); },
        async remove(id) { unwrap(await sb.rpc("admin_delete_member", { p_id: id })); },
      },
      async stats() {
        const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
        const [members, profiles, daily, progress] = await Promise.all([
          sb.from("members").select("id, email, display_name, role, approved, created_at"),
          sb.from("profiles").select("id, owner_id, name, avatar_color, avatar_emoji, is_kids"),
          sb.from("watch_daily").select("*").gte("day", since),
          sb.from("watch_progress").select("*"),
        ]);
        return { members: unwrap(members), profiles: unwrap(profiles), watch_daily: unwrap(daily), watch_progress: unwrap(progress) };
      },

      /** Bestand uploaden met voortgang. Geeft { path } terug. */
      async upload(bucket, file, { folder = "", onProgress, signal } = {}) {
        const { data: sessionData } = await sb.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error("Je bent niet ingelogd.");
        const path = `${folder ? folder.replace(/\/+$/, "") + "/" : ""}${uid().slice(0, 8)}-${safeFileName(file.name)}`;
        const url = `${base}/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", url);
          xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          xhr.setRequestHeader("apikey", CONFIG.SUPABASE_ANON_KEY);
          xhr.setRequestHeader("x-upsert", "true");
          xhr.setRequestHeader("cache-control", "max-age=31536000");
          if (file.type) xhr.setRequestHeader("Content-Type", file.type);
          xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total, e.loaded, e.total); };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) return resolve();
            let msg = xhr.responseText;
            try { msg = JSON.parse(xhr.responseText).message || msg; } catch { /* laat tekst staan */ }
            reject(new Error(friendly({ message: msg || `Upload mislukt (${xhr.status})` })));
          };
          xhr.onerror = () => reject(new Error(friendly({ message: "Failed to fetch" })));
          xhr.onabort = () => reject(new DOMException("Upload geannuleerd", "AbortError"));
          signal?.addEventListener("abort", () => xhr.abort());
          xhr.send(file);
        });
        return { path };
      },
      async removeFiles(bucket, paths) {
        const list = (paths || []).filter((p) => p && !/^(https?:|data:|blob:)/.test(p));
        if (list.length) await sb.storage.from(bucket).remove(list);
      },
    },
  };
  return api;
}
