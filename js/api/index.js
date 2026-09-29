/* Kiest de backend: Supabase als config.js is ingevuld, anders de demo-modus. */

import { CONFIG } from "../config.js";

/** Live binding: na initApi() gebruiken alle modules dit object. */
export let api = null;

export const hasSupabaseConfig = () => Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);

export function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = new URL(src, document.baseURI).href;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Kon ${src} niet laden.`));
    document.head.appendChild(s);
  });
}

export async function initApi() {
  if (hasSupabaseConfig()) {
    if (!window.supabase) await loadScript("vendor/supabase.js");
    api = (await import("./supabase.js")).create();
  } else {
    api = (await import("./demo.js")).create();
  }
  return api;
}
