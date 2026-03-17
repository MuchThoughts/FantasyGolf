create table if not exists public.fantasy_leagues (
  name text primary key,
  users jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.league_selections (
  league_name text not null,
  season_year integer not null check (season_year in (2025, 2026)),
  team_name text not null,
  selections jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists league_selections_unique_idx
  on public.league_selections (league_name, season_year, team_name);

create index if not exists league_selections_updated_at_idx
  on public.league_selections (updated_at desc);

create or replace function public.set_fantasy_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_fantasy_leagues_updated_at on public.fantasy_leagues;
create trigger trg_fantasy_leagues_updated_at
before update on public.fantasy_leagues
for each row execute function public.set_fantasy_updated_at();

drop trigger if exists trg_league_selections_updated_at on public.league_selections;
create trigger trg_league_selections_updated_at
before update on public.league_selections
for each row execute function public.set_fantasy_updated_at();

alter table public.fantasy_leagues enable row level security;
alter table public.league_selections enable row level security;

drop policy if exists "Service role can manage fantasy leagues" on public.fantasy_leagues;
create policy "Service role can manage fantasy leagues"
on public.fantasy_leagues
for all
to service_role
using (true)
with check (true);

drop policy if exists "Service role can manage league selections" on public.league_selections;
create policy "Service role can manage league selections"
on public.league_selections
for all
to service_role
using (true)
with check (true);
