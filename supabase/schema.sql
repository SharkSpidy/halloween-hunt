-- =====================================================================
-- Glyph Hunt – Supabase schema
-- =====================================================================

create extension if not exists citext;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      citext not null unique,            -- case-insensitive uniqueness
  total_points  integer not null default 0,
  created_at    timestamptz not null default now(),
  constraint username_format check (username ~ '^[A-Za-z0-9_]{3,20}$')
);

create table if not exists public.stage_completions (
  user_id       uuid not null references public.profiles (id) on delete cascade,
  stage         smallint not null check (stage between 1 and 4),
  finish_rank   integer  not null,                 -- 1 = first user to clear this stage
  points        integer  not null,
  completed_at  timestamptz not null default now(),
  primary key (user_id, stage)
);
create index if not exists stage_completions_stage_rank_idx
  on public.stage_completions (stage, finish_rank);

create table if not exists public.stage_counters (
  stage            smallint primary key check (stage between 1 and 4),
  completed_count  integer not null default 0
);
insert into public.stage_counters (stage) values (1), (2), (3), (4)
  on conflict do nothing;

create table if not exists public.scoring_tiers (
  tier_order  smallint primary key,
  max_rank    integer,           -- inclusive upper bound; NULL = catch-all
  points      integer not null
);
insert into public.scoring_tiers (tier_order, max_rank, points) values
  (1, 20,   100),   -- users 1–20
  (2, 50,   80),    -- users 21–50
  (3, null, 50)     -- everyone after
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.stage_completions enable row level security;
alter table public.stage_counters    enable row level security;
alter table public.scoring_tiers     enable row level security;

drop policy if exists "own profile"      on public.profiles;
drop policy if exists "own completions"  on public.stage_completions;
drop policy if exists "read tiers"       on public.scoring_tiers;

create policy "own profile"     on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "own completions" on public.stage_completions
  for select to authenticated using (user_id = auth.uid());
create policy "read tiers"      on public.scoring_tiers
  for select to anon, authenticated using (true);

-- ---------------------------------------------------------------------
-- Auto-create a profile when a user signs up.
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data ->> 'username');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (select 1 from public.profiles where username = p_username::citext);
$$;
grant execute on function public.username_available(text) to anon, authenticated;

create or replace function public.complete_stage(p_stage integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_rank    integer;
  v_points  integer;
  v_existing public.stage_completions%rowtype;
  v_total   integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_stage is null or p_stage not between 1 and 4 then
    raise exception 'invalid_stage' using errcode = '22023';
  end if;

  select * into v_existing
    from public.stage_completions
   where user_id = v_uid and stage = p_stage;
  if found then
    select total_points into v_total from public.profiles where id = v_uid;
    return jsonb_build_object(
      'stage', p_stage,
      'rank', v_existing.finish_rank,
      'points_awarded', v_existing.points,
      'total_points', v_total,
      'already_completed', true
    );
  end if;

  if p_stage > 1 and not exists (
    select 1 from public.stage_completions
     where user_id = v_uid and stage = p_stage - 1
  ) then
    raise exception 'previous_stage_incomplete' using errcode = 'P0001';
  end if;

  update public.stage_counters
     set completed_count = completed_count + 1
   where stage = p_stage
  returning completed_count into v_rank;

  select points into v_points
    from public.scoring_tiers
   where max_rank is null or v_rank <= max_rank
   order by max_rank asc nulls last
   limit 1;

  insert into public.stage_completions (user_id, stage, finish_rank, points)
  values (v_uid, p_stage, v_rank, v_points);

  update public.profiles
     set total_points = total_points + v_points
   where id = v_uid
  returning total_points into v_total;

  return jsonb_build_object(
    'stage', p_stage,
    'rank', v_rank,
    'points_awarded', v_points,
    'total_points', v_total,
    'already_completed', false
  );
end;
$$;

revoke all on function public.complete_stage(integer) from public, anon;
grant execute on function public.complete_stage(integer) to authenticated;

create or replace function public.get_leaderboard(p_limit integer default 50)
returns table (
  "position"      bigint,
  username        text,
  total_points    integer,
  stages_cleared  integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    row_number() over (order by p.total_points desc, max(sc.completed_at) asc nulls last, p.created_at asc) as "position",
    p.username::text,
    p.total_points,
    count(sc.stage)::integer as stages_cleared
  from public.profiles p
  left join public.stage_completions sc on sc.user_id = p.id
  group by p.id
  order by p.total_points desc, max(sc.completed_at) asc nulls last, p.created_at asc
  limit greatest(1, least(p_limit, 200));
$$;
grant execute on function public.get_leaderboard(integer) to anon, authenticated;