/* Formatteren van tijd, datums en getallen (Nederlands). */

export function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** 4320 -> "1 u 12 min" */
export function fmtDuration(sec) {
  sec = Math.round(sec || 0);
  if (sec <= 0) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h === 0) return `${Math.max(1, m)} min`;
  return m ? `${h} u ${m} min` : `${h} u`;
}

/** Kijktijd in de Studio: 5400 -> "1,5 uur", 1200 -> "20 min" */
export function fmtHours(sec) {
  sec = sec || 0;
  if (sec < 3600) return `${Math.round(sec / 60)} min`;
  const h = sec / 3600;
  return `${h.toLocaleString("nl-NL", { maximumFractionDigits: 1 })} uur`;
}

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }) : "");
export const fmtDateShort = (d) => (d ? new Date(d).toLocaleDateString("nl-NL", { day: "numeric", month: "short" }) : "");
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("nl-NL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");

export function relTime(d) {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return "zojuist";
  if (diff < 3600) return `${Math.floor(diff / 60)} min geleden`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} uur geleden`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d geleden`;
  return fmtDateShort(d);
}

/** Aftellen tot een datum: "3 dagen", "5 uur", "12 min" */
export function countdown(d) {
  const diff = (new Date(d).getTime() - Date.now()) / 1000;
  if (diff <= 0) return "nu";
  const days = Math.floor(diff / 86400);
  if (days >= 2) return `${days} dagen`;
  if (days === 1) return "1 dag";
  const hrs = Math.floor(diff / 3600);
  if (hrs >= 1) return `${hrs} uur`;
  return `${Math.max(1, Math.floor(diff / 60))} min`;
}

export function fmtBytes(n) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toLocaleString("nl-NL", { maximumFractionDigits: i > 1 ? 1 : 0 })} ${u[i]}`;
}

export const fmtNumber = (n) => (n || 0).toLocaleString("nl-NL");
export const plural = (n, one, many) => `${fmtNumber(n)} ${n === 1 ? one : many}`;
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function debounce(fn, ms = 200) {
  let t;
  const wrapped = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

export function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

export function safeFileName(name) {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "bestand";
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) : "";
  return ext ? `${base}.${ext}` : base;
}

/** Dutch: "Aflevering 3" / "Film" labels */
export const kindLabel = (kind) => (kind === "series" ? "Serie" : "Film");

export const RATINGS = ["AL", "6", "9", "12", "14", "16", "18"];
export const KIDS_RATINGS = ["AL", "6", "9"];
export const ratingLabel = (r) => (r === "AL" ? "Alle leeftijden" : `${r}+`);

export const GENRES = ["Familie", "Vakantie", "Documentaire", "Humor", "Muziek", "Sport", "Avontuur", "Feest", "Jeugd", "Live", "Natuur", "Drama", "Reizen", "Thuis"];
