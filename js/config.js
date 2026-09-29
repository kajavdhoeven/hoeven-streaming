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
  SUPABASE_URL: "https://klqogmvijzxzvmzduclc.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_bj1pdhy6VhnRqvm7l7DC9w_jbqyuj5T",  // publishable key (veilig om openbaar te zijn)

  SITE_NAME: "Hoeven+",
};
