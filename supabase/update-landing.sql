-- ============================================================================
--  Hoeven+  -  update: openbare voorpagina
--
--  Draai dit EENMALIG in Supabase > SQL Editor als je het volledige schema al
--  eerder hebt uitgevoerd. (Voor een nieuwe installatie zit dit al in schema.sql.)
--  Veilig om opnieuw te draaien.
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
  limit 12;
$$;

grant execute on function public.public_showcase() to anon, authenticated;
