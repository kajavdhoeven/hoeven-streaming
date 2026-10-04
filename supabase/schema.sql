-- ============================================================================
--  Hoeven+  -  databaseschema voor Supabase
--
--  Plak dit hele bestand in Supabase > SQL Editor > New query > Run.
--  Je kunt het veilig opnieuw draaien: alles is idempotent gemaakt.
--
--  Opbouw:
--    members          Accounts (gekoppeld aan Supabase Auth). Nieuwe accounts moeten
--                     door jou (admin) worden goedgekeurd.
--    profiles         Netflix-stijl profielen per account (max. 5)
--    titles           Films en series
--    videos           De losse video's (1 voor een film, meerdere afleveringen voor een serie)
--    rows             Rijen op de startpagina ("Nieuw", "Vakantie", ...)
--    row_items        Welke titel in welke rij staat, in welke volgorde
--    watch_progress   Kijkvoortgang per profiel per video
--    watch_daily      Kijktijd per dag (voor de statistieken in de Studio)
--    my_list          "Mijn lijst" per profiel
--    settings         Sitebrede instellingen (bijv. mededeling)
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
--  1. Accounts
-- ----------------------------------------------------------------------------
create table if not exists public.members (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text,
  role         text not null default 'member' check (role in ('admin', 'member')),
  approved     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Hulpfuncties voor de beveiligingsregels. 'security definer' zodat ze de
-- members-tabel mogen lezen zonder dat er een recursieve policy ontstaat.
create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where id = auth.uid() and approved);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where id = auth.uid() and approved and role = 'admin');
$$;

-- Bij elke nieuwe registratie automatisch een members-rij aanmaken (nog niet goedgekeurd).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.members (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Een lid volledig verwijderen (ook uit Supabase Auth). Alleen voor admins.
create or replace function public.admin_delete_member(p_id uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Geen toegang'; end if;
  if p_id = auth.uid() then raise exception 'Je kunt jezelf niet verwijderen'; end if;
  delete from auth.users where id = p_id;
end;
$$;

-- ----------------------------------------------------------------------------
--  2. Profielen
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.members (id) on delete cascade,
  name         text not null check (char_length(trim(name)) between 1 and 20),
  avatar_color text not null default 'c1',
  avatar_emoji text not null default '🙂',
  is_kids      boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists profiles_owner_idx on public.profiles (owner_id);

create or replace function public.limit_profiles()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.profiles where owner_id = new.owner_id) >= 5 then
    raise exception 'Maximaal 5 profielen per account';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_limit on public.profiles;
create trigger profiles_limit before insert on public.profiles
  for each row execute function public.limit_profiles();

-- ----------------------------------------------------------------------------
--  3. Catalogus
-- ----------------------------------------------------------------------------
create table if not exists public.titles (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null default 'movie' check (kind in ('movie', 'series')),
  title         text not null,
  tagline       text,
  description   text,
  year          int,
  genres        text[] not null default '{}',
  rating        text not null default 'AL' check (rating in ('AL', '6', '9', '12', '14', '16', '18')),
  poster_path   text,                  -- pad in bucket 'artwork' (staand, 2:3)
  backdrop_path text,                  -- pad in bucket 'artwork' (breed, 16:9)
  status        text not null default 'draft' check (status in ('draft', 'published', 'coming_soon')),
  release_at    timestamptz,           -- bij 'coming_soon': vanaf dan automatisch kijkbaar
  featured      boolean not null default false,
  show_on_landing boolean not null default false, -- mag op de openbare voorpagina (zonder inloggen)
  is_new boolean not null default false,          -- handmatig "Nieuw"-label
  created_by    uuid references public.members (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists titles_touch on public.titles;
create trigger titles_touch before update on public.titles
  for each row execute function public.touch_updated_at();

create table if not exists public.videos (
  id               uuid primary key default gen_random_uuid(),
  title_id         uuid not null references public.titles (id) on delete cascade,
  season           int not null default 1,
  episode          int not null default 1,
  name             text not null,
  description      text,
  thumb_path       text,               -- pad in bucket 'artwork'
  source           text not null default 'storage' check (source in ('storage', 'url', 'youtube')),
  video_path       text not null,      -- pad in bucket 'videos', een volledige URL (mp4 / m3u8) of een YouTube-id
  duration_seconds int,
  intro_start      int,                -- optioneel: "Intro overslaan" knop
  intro_end        int,
  created_at       timestamptz not null default now()
);
create index if not exists videos_title_idx on public.videos (title_id, season, episode);

create table if not exists public.rows (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  position   int not null default 0,
  visible    boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.row_items (
  row_id   uuid not null references public.rows (id) on delete cascade,
  title_id uuid not null references public.titles (id) on delete cascade,
  position int not null default 0,
  primary key (row_id, title_id)
);

-- ----------------------------------------------------------------------------
--  4. Gebruikersdata
-- ----------------------------------------------------------------------------
create table if not exists public.watch_progress (
  profile_id       uuid not null references public.profiles (id) on delete cascade,
  video_id         uuid not null references public.videos (id) on delete cascade,
  title_id         uuid not null references public.titles (id) on delete cascade,
  position_seconds numeric not null default 0,
  duration_seconds numeric not null default 0,
  completed        boolean not null default false,
  updated_at       timestamptz not null default now(),
  primary key (profile_id, video_id)
);
create index if not exists watch_progress_profile_idx on public.watch_progress (profile_id, updated_at desc);

create table if not exists public.watch_daily (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  video_id   uuid not null references public.videos (id) on delete cascade,
  title_id   uuid not null references public.titles (id) on delete cascade,
  day        date not null default current_date,
  seconds    int not null default 0,
  primary key (profile_id, video_id, day)
);

create table if not exists public.my_list (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  title_id   uuid not null references public.titles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, title_id)
);

create table if not exists public.settings (
  key   text primary key,
  value jsonb not null default '{}'::jsonb
);

insert into public.settings (key, value) values
  ('announcement', '{"enabled": false, "text": ""}'),
  ('site',         '{"name": "Hoeven+"}')
on conflict (key) do nothing;

-- Voortgang opslaan + kijktijd bijhouden in 1 aanroep (de speler roept dit elke ~10 sec aan).
create or replace function public.save_progress(
  p_profile  uuid,
  p_video    uuid,
  p_title    uuid,
  p_position numeric,
  p_duration numeric,
  p_delta    int default 0
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.profiles where id = p_profile and owner_id = auth.uid()) then
    raise exception 'Geen toegang tot dit profiel';
  end if;

  insert into public.watch_progress (profile_id, video_id, title_id, position_seconds, duration_seconds, completed, updated_at)
  values (
    p_profile, p_video, p_title, greatest(p_position, 0), greatest(p_duration, 0),
    p_duration > 0 and p_position >= p_duration * 0.95, now()
  )
  on conflict (profile_id, video_id) do update set
    position_seconds = excluded.position_seconds,
    duration_seconds = excluded.duration_seconds,
    completed        = excluded.completed,
    updated_at       = now();

  if p_delta > 0 then
    insert into public.watch_daily (profile_id, video_id, title_id, day, seconds)
    values (p_profile, p_video, p_title, current_date, least(p_delta, 120))
    on conflict (profile_id, video_id, day) do update
      set seconds = public.watch_daily.seconds + excluded.seconds;
  end if;
end;
$$;

-- Bestaande installaties: YouTube als videobron toestaan
alter table public.videos drop constraint if exists videos_source_check;
alter table public.videos add constraint videos_source_check check (source in ('storage', 'url', 'youtube'));

-- Handmatig "Nieuw"-label (jij bepaalt welke titels het krijgen)
alter table public.titles add column if not exists is_new boolean not null default false;

-- Bestaande installaties: kolom voor de openbare voorpagina toevoegen
alter table public.titles add column if not exists show_on_landing boolean not null default false;

-- Openbare voorpagina: toont ALLEEN titels waarvoor jij "Tonen op de openbare voorpagina" hebt aangezet,
-- en alleen titel, soort, jaar, genres en poster. De volgorde is "populair": de meeste kijktijd in de
-- laatste 14 dagen eerst, daarna uitgelicht en nieuwste.
create or replace function public.public_showcase()
returns table (id uuid, title text, kind text, year int, genres text[], poster_path text)
language sql stable security definer set search_path = public as $$
  select t.id, t.title, t.kind, t.year, t.genres, t.poster_path
  from public.titles t
  where t.show_on_landing and t.status = 'published' and t.poster_path is not null
  order by
    coalesce((select sum(w.seconds) from public.watch_daily w
              where w.title_id = t.id and w.day >= current_date - 14), 0) desc,
    t.featured desc,
    t.created_at desc
  limit 40;
$$;

-- ----------------------------------------------------------------------------
--  5. Beveiliging (Row Level Security)
--     Regel: alleen goedgekeurde leden zien iets, alleen admins mogen beheren.
-- ----------------------------------------------------------------------------
alter table public.members        enable row level security;
alter table public.profiles       enable row level security;
alter table public.titles         enable row level security;
alter table public.videos         enable row level security;
alter table public.rows           enable row level security;
alter table public.row_items      enable row level security;
alter table public.watch_progress enable row level security;
alter table public.watch_daily    enable row level security;
alter table public.my_list        enable row level security;
alter table public.settings       enable row level security;

-- members: eigen rij lezen (ook als je nog niet bent goedgekeurd), admin alles
drop policy if exists members_select on public.members;
create policy members_select on public.members for select to authenticated
  using (id = auth.uid() or public.is_admin());
drop policy if exists members_admin_update on public.members;
create policy members_admin_update on public.members for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- profiles: alleen je eigen profielen
drop policy if exists profiles_owner_all on public.profiles;
create policy profiles_owner_all on public.profiles for all to authenticated
  using (owner_id = auth.uid() and public.is_member())
  with check (owner_id = auth.uid() and public.is_member());
drop policy if exists profiles_admin_select on public.profiles;
create policy profiles_admin_select on public.profiles for select to authenticated
  using (public.is_admin());

-- titles: leden zien alles behalve concepten, admin ziet en beheert alles
drop policy if exists titles_select on public.titles;
create policy titles_select on public.titles for select to authenticated
  using (public.is_admin() or (public.is_member() and status in ('published', 'coming_soon')));
drop policy if exists titles_admin_write on public.titles;
create policy titles_admin_write on public.titles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- videos: pas zichtbaar als de titel gepubliceerd is (of de releasedatum voorbij is)
drop policy if exists videos_select on public.videos;
create policy videos_select on public.videos for select to authenticated
  using (
    public.is_admin() or (
      public.is_member() and exists (
        select 1 from public.titles t
        where t.id = videos.title_id
          and (t.status = 'published'
               or (t.status = 'coming_soon' and t.release_at is not null and t.release_at <= now()))
      )
    )
  );
drop policy if exists videos_admin_write on public.videos;
create policy videos_admin_write on public.videos for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- rows / row_items
drop policy if exists rows_select on public.rows;
create policy rows_select on public.rows for select to authenticated
  using (public.is_admin() or (public.is_member() and visible));
drop policy if exists rows_admin_write on public.rows;
create policy rows_admin_write on public.rows for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists row_items_select on public.row_items;
create policy row_items_select on public.row_items for select to authenticated
  using (public.is_member());
drop policy if exists row_items_admin_write on public.row_items;
create policy row_items_admin_write on public.row_items for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- watch_progress / watch_daily: eigen profielen lezen (schrijven gaat via save_progress), admin leest alles
drop policy if exists watch_progress_owner_select on public.watch_progress;
create policy watch_progress_owner_select on public.watch_progress for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = profile_id and p.owner_id = auth.uid()) or public.is_admin());
drop policy if exists watch_progress_owner_delete on public.watch_progress;
create policy watch_progress_owner_delete on public.watch_progress for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id = profile_id and p.owner_id = auth.uid()));

drop policy if exists watch_daily_select on public.watch_daily;
create policy watch_daily_select on public.watch_daily for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = profile_id and p.owner_id = auth.uid()) or public.is_admin());

-- my_list: eigen profielen
drop policy if exists my_list_owner_all on public.my_list;
create policy my_list_owner_all on public.my_list for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = profile_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from public.profiles p where p.id = profile_id and p.owner_id = auth.uid()));

-- settings: leden lezen, admin schrijft
drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings for select to authenticated
  using (public.is_member());
drop policy if exists settings_admin_write on public.settings;
create policy settings_admin_write on public.settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
--  6. Opslag (Storage)
--     artwork = posters en thumbnails (publiek leesbaar, zodat plaatjes snel laden)
--     videos  = de video's zelf (privé; de site gebruikt tijdelijke, ondertekende links)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('artwork', 'artwork', true), ('videos', 'videos', false)
on conflict (id) do nothing;

drop policy if exists artwork_read on storage.objects;
create policy artwork_read on storage.objects for select
  using (bucket_id = 'artwork');
drop policy if exists artwork_admin_insert on storage.objects;
create policy artwork_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'artwork' and public.is_admin());
drop policy if exists artwork_admin_update on storage.objects;
create policy artwork_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'artwork' and public.is_admin());
drop policy if exists artwork_admin_delete on storage.objects;
create policy artwork_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'artwork' and public.is_admin());

drop policy if exists videos_member_read on storage.objects;
create policy videos_member_read on storage.objects for select to authenticated
  using (bucket_id = 'videos' and public.is_member());
drop policy if exists videos_admin_insert on storage.objects;
create policy videos_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'videos' and public.is_admin());
drop policy if exists videos_admin_update on storage.objects;
create policy videos_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'videos' and public.is_admin());
drop policy if exists videos_admin_delete on storage.objects;
create policy videos_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'videos' and public.is_admin());

-- ----------------------------------------------------------------------------
--  7. Rechten voor de API (RLS bepaalt daarna wat er echt mag)
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema public from anon;
grant execute on all functions in schema public to authenticated;
grant execute on function public.public_showcase() to anon, authenticated; -- voorpagina, ook zonder inloggen

-- ----------------------------------------------------------------------------
--  8. JIJ ALS ADMIN
--     Maak eerst een account aan op de site (Registreren). Haal daarna hieronder de
--     twee streepjes voor de regel weg, vul je e-mailadres in en draai alleen die regel.
-- ----------------------------------------------------------------------------
-- update public.members set role = 'admin', approved = true where email = 'JOUW-EMAIL@VOORBEELD.NL';
