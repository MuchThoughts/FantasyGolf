create table if not exists public.team_selections (
  season_year integer not null check (season_year in (2025, 2026)),
  team_name text not null check (team_name in ('Sean', 'Lia', 'Adair', 'Rhett', 'VP')),
  selections jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (season_year, team_name)
);

create index if not exists team_selections_updated_at_idx
  on public.team_selections (updated_at desc);

create or replace function public.set_team_selections_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_team_selections_updated_at on public.team_selections;
create trigger trg_team_selections_updated_at
before update on public.team_selections
for each row execute function public.set_team_selections_updated_at();

alter table public.team_selections enable row level security;

drop policy if exists "Service role can manage team selections" on public.team_selections;
create policy "Service role can manage team selections"
on public.team_selections
for all
to service_role
using (true)
with check (true);
