/* Catalogus in het geheugen: titels, video's, rijen + handige zoekfuncties. */

import { api } from "../api/index.js";
import { KIDS_RATINGS } from "../ui/format.js";

export const cat = {
  loaded: false,
  titles: [],          // alle titels die de gebruiker mag zien (admin: ook concepten)
  byId: new Map(),
  videos: new Map(),   // video-id -> video
  byTitle: new Map(),  // titel-id -> video's (gesorteerd)
  rows: [],
};

let loading = null;

export function loadCatalog(force = false) {
  if (cat.loaded && !force) return Promise.resolve(cat);
  if (loading && !force) return loading;
  loading = api.catalog.load().then(({ titles, videos, rows }) => {
    cat.titles = titles;
    cat.byId = new Map(titles.map((t) => [t.id, t]));
    cat.videos = new Map(videos.map((v) => [v.id, v]));
    cat.byTitle = new Map();
    for (const v of videos) {
      if (!cat.byTitle.has(v.title_id)) cat.byTitle.set(v.title_id, []);
      cat.byTitle.get(v.title_id).push(v);
    }
    for (const list of cat.byTitle.values()) list.sort((a, b) => a.season - b.season || a.episode - b.episode);
    cat.rows = rows;
    cat.loaded = true;
    return cat;
  }).finally(() => { loading = null; });
  return loading;
}

export function resetCatalog() {
  cat.loaded = false; cat.titles = []; cat.byId = new Map(); cat.videos = new Map(); cat.byTitle = new Map(); cat.rows = [];
}

/* --- Status ------------------------------------------------------------------ */

/** Kijkbaar: gepubliceerd, of 'binnenkort' waarvan de releasedatum voorbij is. */
export function isAvailable(t) {
  if (t.status === "published") return true;
  return t.status === "coming_soon" && !!t.release_at && new Date(t.release_at) <= new Date();
}
export const isUpcoming = (t) => t.status === "coming_soon" && !isAvailable(t);
export const isDraft = (t) => t.status === "draft";

/** Titels voor de kijker (geen concepten, kinderprofielen alleen geschikte inhoud). */
export function visibleTitles(profile) {
  return cat.titles.filter((t) => !isDraft(t) && (!profile?.is_kids || KIDS_RATINGS.includes(t.rating)));
}
export const playableTitles = (profile) => visibleTitles(profile).filter(isAvailable);
export const upcomingTitles = (profile) => visibleTitles(profile).filter(isUpcoming).sort((a, b) => new Date(a.release_at || 8e15) - new Date(b.release_at || 8e15));

/* --- Opzoeken ------------------------------------------------------------------ */

export const getTitle = (id) => cat.byId.get(id) || null;
export const getVideo = (id) => cat.videos.get(id) || null;
export const episodesOf = (titleId) => cat.byTitle.get(titleId) || [];
export const seasonsOf = (titleId) => [...new Set(episodesOf(titleId).map((v) => v.season))];

export function nextVideo(video) {
  const list = episodesOf(video.title_id);
  const i = list.findIndex((v) => v.id === video.id);
  return i >= 0 ? list[i + 1] || null : null;
}

/* --- Afbeeldingen ---------------------------------------------------------------- */

export const posterUrl = (t) => api.media.artwork(t.poster_path) || api.media.artwork(t.backdrop_path);
export const backdropUrl = (t) => api.media.artwork(t.backdrop_path) || api.media.artwork(t.poster_path);
export const thumbUrl = (v, t) => api.media.artwork(v.thumb_path) || (t ? backdropUrl(t) : null);

export function searchTitles(list, q) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  return list
    .map((t) => {
      const hay = `${t.title} ${t.tagline || ""} ${(t.genres || []).join(" ")} ${t.year || ""} ${t.description || ""}`.toLowerCase();
      let score = 0;
      if (t.title.toLowerCase().startsWith(q)) score += 3;
      if (t.title.toLowerCase().includes(q)) score += 2;
      if ((t.genres || []).some((g) => g.toLowerCase().includes(q))) score += 1.5;
      if (hay.includes(q)) score += 1;
      return { t, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.t);
}
