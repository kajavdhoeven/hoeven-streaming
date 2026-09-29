/* Kijkvoortgang en "Mijn lijst" voor het actieve profiel. */

import { api } from "../api/index.js";
import { cat, episodesOf, getTitle, getVideo, isAvailable, nextVideo, visibleTitles } from "./catalog.js";
import { fmtClock } from "../ui/format.js";

export const ud = {
  profileId: null,
  progress: new Map(), // video-id -> record
  list: [],            // titel-id's, nieuwste eerst
};

export async function loadUserdata(profileId) {
  ud.profileId = profileId;
  const [progress, list] = await Promise.all([api.userdata.progress(profileId), api.userdata.myList(profileId)]);
  ud.progress = new Map(progress.map((r) => [r.video_id, r]));
  ud.list = list;
}

export function resetUserdata() { ud.profileId = null; ud.progress = new Map(); ud.list = []; }

export const progressOf = (videoId) => ud.progress.get(videoId) || null;
export const fraction = (rec) => (rec && rec.duration_seconds > 0 ? Math.min(1, rec.position_seconds / rec.duration_seconds) : 0);

/* --- Mijn lijst ------------------------------------------------------------------- */

export const inMyList = (titleId) => ud.list.includes(titleId);

export async function toggleMyList(titleId) {
  const on = !inMyList(titleId);
  ud.list = on ? [titleId, ...ud.list] : ud.list.filter((id) => id !== titleId); // optimistisch
  try { await api.userdata.setMyList(ud.profileId, titleId, on); }
  catch (e) { ud.list = on ? ud.list.filter((id) => id !== titleId) : [titleId, ...ud.list]; throw e; }
  return on;
}

/* --- Voortgang ------------------------------------------------------------------------ */

export async function saveProgress({ video, position, duration, delta = 0 }) {
  const rec = {
    video_id: video.id, title_id: video.title_id, profile_id: ud.profileId,
    position_seconds: position, duration_seconds: duration,
    completed: duration > 0 && position >= duration * 0.95, updated_at: new Date().toISOString(),
  };
  ud.progress.set(video.id, rec);
  await api.userdata.saveProgress({ profileId: ud.profileId, videoId: video.id, titleId: video.title_id, position, duration, delta });
}

export async function removeFromContinue(titleId) {
  for (const [id, r] of ud.progress) if (r.title_id === titleId) ud.progress.delete(id);
  await api.userdata.removeProgress(ud.profileId, titleId);
}

/**
 * Wat gebeurt er als je op "Afspelen" drukt?
 * -> { video, rec, pct, kind: "start" | "resume" | "next" | "replay", label }
 */
export function resumeTarget(titleId) {
  const eps = episodesOf(titleId);
  if (!eps.length) return null;
  const title = getTitle(titleId);
  const isSeries = title?.kind === "series";
  const recs = eps.map((v) => ({ v, r: ud.progress.get(v.id) })).filter((x) => x.r);
  if (!recs.length) return { video: eps[0], rec: null, pct: 0, kind: "start", label: "Afspelen" };

  recs.sort((a, b) => new Date(b.r.updated_at) - new Date(a.r.updated_at));
  const { v, r } = recs[0];
  const tag = isSeries ? `S${v.season} A${v.episode}` : "";
  if (!r.completed && r.position_seconds > 5) {
    return { video: v, rec: r, pct: fraction(r), kind: "resume", label: isSeries ? `Hervat ${tag}` : "Hervatten", sub: `${fmtClock(r.position_seconds)} van ${fmtClock(r.duration_seconds)}` };
  }
  const nxt = nextVideo(v);
  if (nxt) {
    const nrec = ud.progress.get(nxt.id);
    return { video: nxt, rec: nrec || null, pct: fraction(nrec), kind: "next", label: `Volgende: S${nxt.season} A${nxt.episode}` };
  }
  return { video: eps[0], rec: null, pct: 0, kind: "replay", label: "Opnieuw kijken" };
}

/** Rij "Verder kijken": per titel het volgende dat je moet zien, nieuwste eerst. */
export function continueWatching(profile) {
  const allowed = new Set(visibleTitles(profile).filter(isAvailable).map((t) => t.id));
  const latest = new Map(); // titel -> laatste update
  for (const r of ud.progress.values()) {
    if (!allowed.has(r.title_id) || !getVideo(r.video_id)) continue;
    const t = new Date(r.updated_at).getTime();
    if (!latest.has(r.title_id) || latest.get(r.title_id) < t) latest.set(r.title_id, t);
  }
  return [...latest.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([titleId]) => ({ title: getTitle(titleId), target: resumeTarget(titleId) }))
    .filter((x) => x.target && (x.target.kind === "resume" || x.target.kind === "next"));
}
