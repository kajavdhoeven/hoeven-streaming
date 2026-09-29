/* ==========================================================================
   Hoeven+  -  configuratie

   Vul hier je Supabase-gegevens in (Supabase > Project Settings > API).
   Beide waarden zijn bedoeld om openbaar in de website te staan: de beveiliging
   zit in de database-regels (schema.sql), niet in het geheimhouden van de key.
   Gebruik NOOIT de "service_role" key op deze plek.

   Laat je ze leeg, dan draait de site in DEMO-MODUS met voorbeeldgegevens
   (opgeslagen in je eigen browser), handig om het ontwerp te bekijken.
   ========================================================================== */

export const CONFIG = {
  SUPABASE_URL: "",       // bijv. "https://abcdxyz.supabase.co"
  SUPABASE_ANON_KEY: "",  // de lange "anon public" key

  SITE_NAME: "Hoeven+",
};
