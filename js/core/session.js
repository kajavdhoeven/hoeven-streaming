/* Wie is ingelogd, welk profiel kijkt er, en de sitebrede instellingen. */

import { api } from "../api/index.js";
import { loadCatalog, resetCatalog } from "../data/catalog.js";
import { loadUserdata, resetUserdata } from "../data/userdata.js";

const PROFILE_KEY = "hp:profile"; // sessionStorage: elke nieuwe sessie begint bij "Wie kijkt er?"

export const session = {
  member: null,
  profiles: [],
  profile: null,
  settings: {},
};

const subs = new Set();
export const onSession = (fn) => { subs.add(fn); return () => subs.delete(fn); };
const emit = () => subs.forEach((fn) => fn(session));

export const isAdmin = () => session.member?.role === "admin" && session.member?.approved;

async function afterAuth() {
  const [profiles, settings] = await Promise.all([api.profiles.list(), api.settings.get().catch(() => ({}))]);
  session.profiles = profiles;
  session.settings = settings;
  let saved = null;
  try { saved = sessionStorage.getItem(PROFILE_KEY); } catch { /* privémodus */ }
  const p = profiles.find((x) => x.id === saved);
  if (p) await activateProfile(p);
}

export async function bootSession() {
  try { session.member = await api.auth.init(); } catch (e) { console.warn("Sessie niet hersteld:", e); session.member = null; }
  if (session.member?.approved) {
    try { await afterAuth(); } catch (e) { console.error(e); }
  }
  emit();
}

export async function signIn(email, password) {
  session.member = await api.auth.signIn(email, password);
  if (session.member?.approved) await afterAuth();
  emit();
  return session.member;
}

export async function signUp(email, password, name) {
  const res = await api.auth.signUp(email, password, name);
  session.member = res.member;
  if (res.member?.approved) await afterAuth();
  emit();
  return res;
}

export async function signOut() {
  try { await api.auth.signOut(); } catch (e) { console.warn(e); }
  resetLocal();
  emit();
}

export function resetLocal() {
  session.member = null; session.profiles = []; session.profile = null; session.settings = {};
  try { sessionStorage.removeItem(PROFILE_KEY); } catch { /* */ }
  resetCatalog(); resetUserdata();
}

export async function refreshMember() {
  session.member = await api.auth.refreshMember();
  if (session.member?.approved && !session.profiles.length) await afterAuth();
  emit();
  return session.member;
}

export async function reloadProfiles() {
  session.profiles = await api.profiles.list();
  if (session.profile && !session.profiles.find((p) => p.id === session.profile.id)) leaveProfile();
  emit();
  return session.profiles;
}

export async function activateProfile(profile) {
  session.profile = profile;
  try { sessionStorage.setItem(PROFILE_KEY, profile.id); } catch { /* */ }
  await Promise.all([loadCatalog(), loadUserdata(profile.id)]);
  emit();
}

export function leaveProfile() {
  session.profile = null;
  try { sessionStorage.removeItem(PROFILE_KEY); } catch { /* */ }
  resetUserdata();
  emit();
}

export async function reloadSettings() {
  session.settings = await api.settings.get().catch(() => session.settings);
  emit();
}
