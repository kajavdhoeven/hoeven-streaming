-- ============================================================================
--  Hoeven+  -  updates (openbare voorpagina + YouTube als videobron)
--
--  Draai dit in Supabase > SQL Editor als je het volledige schema al eerder hebt
--  uitgevoerd. (Voor een nieuwe installatie zit dit al in schema.sql.)
--  Veilig om opnieuw te draaien: je kunt het na elke update gewoon nog eens draaien.
-- ============================================================================

alter table public.titles add column if not exists show_on_landing boolean not null default false;

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

grant execute on function public.public_showcase() to anon, authenticated;

-- Handmatig "Nieuw"-label per titel (aan/uit in de Studio)
alter table public.titles add column if not exists is_new boolean not null default false;

-- YouTube als videobron toestaan
alter table public.videos drop constraint if exists videos_source_check;
alter table public.videos add constraint videos_source_check check (source in ('storage', 'url', 'youtube'));

-- OPTIONEEL: wil je het raster op de voorpagina vullen met al je gepubliceerde titels?
-- Haal de twee streepjes weg voor de regel hieronder en draai hem. Daarmee worden al je
-- gepubliceerde titels openbaar zichtbaar (alleen poster en titel). Wil je dat niet,
-- zet dan per titel in de Studio "Tonen op de openbare voorpagina" aan.
-- update public.titles set show_on_landing = true where status = 'published' and poster_path is not null;
