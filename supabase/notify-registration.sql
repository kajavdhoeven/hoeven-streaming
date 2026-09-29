-- ============================================================================
--  Hoeven+  -  e-mail naar jou bij elke nieuwe registratie
--
--  Werkt met Resend (gratis) en pg_net (zit in Supabase). Draai dit bestand in
--  Supabase > SQL Editor NADAT je de 3 waarden hieronder hebt ingevuld.
--
--  De waarden worden versleuteld opgeslagen in Supabase Vault. Ze komen dus
--  nooit in de website of op GitHub terecht. Zet de ingevulde versie NIET op GitHub.
--
--  Je kunt dit script veilig opnieuw draaien (bijv. om je e-mailadres te wijzigen).
-- ============================================================================

-- >>> VUL DEZE 3 WAARDEN IN (alleen tussen de aanhalingstekens veranderen) <<<
do $$
declare
  v_resend_key text := 'RE_JOUW_RESEND_API_KEY';           -- begint met re_
  v_to_email   text := 'jouw-email@voorbeeld.nl';          -- hetzelfde adres als je Resend-account
  v_site_url   text := 'https://jouwproject.pages.dev';    -- adres van je site, zonder / aan het eind
begin
  delete from vault.secrets where name in ('resend_api_key', 'notify_email', 'notify_site_url');
  perform vault.create_secret(v_resend_key, 'resend_api_key');
  perform vault.create_secret(v_to_email,   'notify_email');
  perform vault.create_secret(v_site_url,   'notify_site_url');
end $$;

create extension if not exists pg_net;

-- Verstuurt de mail. Een fout hier mag NOOIT een registratie laten mislukken.
create or replace function public.notify_new_member()
returns trigger language plpgsql security definer set search_path = public, extensions, vault as $$
declare
  v_key  text;
  v_to   text;
  v_site text;
  v_name text;
  v_mail text;
begin
  select decrypted_secret into v_key  from vault.decrypted_secrets where name = 'resend_api_key';
  select decrypted_secret into v_to   from vault.decrypted_secrets where name = 'notify_email';
  select decrypted_secret into v_site from vault.decrypted_secrets where name = 'notify_site_url';
  if v_key is null or v_to is null then return new; end if;

  -- Gebruikersinvoer veilig maken voor in een HTML-mail
  v_name := replace(replace(replace(replace(coalesce(new.display_name, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
  v_mail := replace(replace(replace(replace(coalesce(new.email, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');

  perform net.http_post(
    url     := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
    body    := jsonb_build_object(
      'from',    'Hoeven+ <onboarding@resend.dev>',
      'to',      jsonb_build_array(v_to),
      'subject', 'Nieuwe registratie op Hoeven+: ' || regexp_replace(coalesce(nullif(new.display_name, ''), new.email), '[\r\n]+', ' ', 'g'),
      'html',    '<div style="font-family:Arial,sans-serif;max-width:480px">'
                 || '<h2>Iemand wil kijken op Hoeven+</h2>'
                 || '<p><b>Naam:</b> ' || v_name || '<br><b>E-mail:</b> ' || v_mail || '</p>'
                 || '<p>Deze persoon kan pas kijken nadat jij hem of haar goedkeurt.</p>'
                 || case when v_site is not null
                      then '<p><a href="' || v_site || '/#/studio/members" style="background:#3f58c6;color:#fff;padding:12px 20px;border-radius:99px;text-decoration:none;display:inline-block">Openen en goedkeuren</a></p>'
                      else '' end
                 || '<p style="color:#888;font-size:12px">Ken je deze persoon niet? Dan hoef je niets te doen.</p></div>'
    )
  );
  return new;
exception when others then
  return new; -- de mail is mislukt, maar de registratie moet gewoon doorgaan
end;
$$;

drop trigger if exists on_member_created_notify on public.members;
create trigger on_member_created_notify
  after insert on public.members
  for each row execute function public.notify_new_member();
