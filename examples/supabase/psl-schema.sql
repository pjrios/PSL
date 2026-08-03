-- Panamanian Sign Language (PSL) — first complete schema
-- Paste this same file into the website's Datos > Mis datos > SQL importer,
-- then run it once in Supabase > SQL Editor.

begin;

create schema if not exists private;
revoke all on schema private from public;

-- @psl-access user_owned
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  display_name text not null default 'Estudiante',
  avatar_url text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Kept private in the visual editor because users must never assign themselves
-- the teacher role. A user can have both student and teacher rows.
-- @psl-access private
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('student', 'teacher')),
  created_at timestamptz not null default now(),
  constraint user_roles_user_role_key unique (user_id, role)
);

-- @psl-access public_read
create table if not exists public.practices (
  id uuid primary key default gen_random_uuid(),
  published boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  source text not null default 'teacher' check (source in ('system', 'teacher')),
  title text not null,
  description text,
  media_url text,
  mediapipe_reference jsonb,
  difficulty integer not null default 1 check (difficulty between 1 and 5),
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0),
  updated_at timestamptz not null default now(),
  constraint practices_source_owner_check check (
    source = 'system' or created_by is not null
  )
);

-- Every attempt is history. The three most recent practices come from this
-- table, so a separate "recent" table would duplicate information.
-- @psl-access user_owned
create table if not exists public.practice_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  score numeric check (score is null or score between 0 and 100),
  feedback text,
  mediapipe_result jsonb,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0)
);

-- One summary row per student and practice for fast progress screens.
-- @psl-access user_owned
create table if not exists public.practice_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed')),
  best_score numeric check (best_score is null or best_score between 0 and 100),
  attempts_count integer not null default 0 check (attempts_count >= 0),
  last_practiced_at timestamptz,
  constraint practice_progress_user_practice_key unique (user_id, practice_id)
);

-- @psl-access user_owned
create table if not exists public.favorite_practices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  practice_id uuid not null references public.practices(id) on delete cascade,
  constraint favorite_practices_user_practice_key unique (user_id, practice_id)
);

create or replace function private.has_role(requested_user_id uuid, requested_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = requested_user_id and role = requested_role
  );
$$;

revoke all on function private.has_role(uuid, text) from public;
grant usage on schema private to authenticated;
grant execute on function private.has_role(uuid, text) to authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

drop trigger if exists practices_set_updated_at on public.practices;
create trigger practices_set_updated_at
before update on public.practices
for each row execute function private.set_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), 'Estudiante')
  )
  on conflict (user_id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'student')
  on conflict (user_id, role) do nothing;

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

-- Backfill accounts created before this schema was installed.
insert into public.profiles (user_id, display_name)
select
  id,
  coalesce(nullif(raw_user_meta_data ->> 'display_name', ''), 'Estudiante')
from auth.users
on conflict (user_id) do nothing;

insert into public.user_roles (user_id, role)
select id, 'student'
from auth.users
on conflict (user_id, role) do nothing;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.practices enable row level security;
alter table public.practice_attempts enable row level security;
alter table public.practice_progress enable row level security;
alter table public.favorite_practices enable row level security;

drop policy if exists profiles_read_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_read_own on public.profiles
for select to authenticated using ((select auth.uid()) = user_id);
create policy profiles_update_own on public.profiles
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name, avatar_url, bio) on table public.profiles to authenticated;

drop policy if exists user_roles_read_own on public.user_roles;
create policy user_roles_read_own on public.user_roles
for select to authenticated using ((select auth.uid()) = user_id);
revoke all on table public.user_roles from anon, authenticated;
grant select on table public.user_roles to authenticated;

drop policy if exists practices_public_read on public.practices;
drop policy if exists practices_teacher_read_own on public.practices;
drop policy if exists practices_teacher_insert on public.practices;
drop policy if exists practices_teacher_update on public.practices;
drop policy if exists practices_teacher_delete on public.practices;
create policy practices_public_read on public.practices
for select to anon, authenticated using (published = true);
create policy practices_teacher_read_own on public.practices
for select to authenticated
using (created_by = (select auth.uid()) and private.has_role((select auth.uid()), 'teacher'));
create policy practices_teacher_insert on public.practices
for insert to authenticated
with check (
  created_by = (select auth.uid())
  and source = 'teacher'
  and private.has_role((select auth.uid()), 'teacher')
);
create policy practices_teacher_update on public.practices
for update to authenticated
using (created_by = (select auth.uid()) and private.has_role((select auth.uid()), 'teacher'))
with check (created_by = (select auth.uid()) and private.has_role((select auth.uid()), 'teacher'));
create policy practices_teacher_delete on public.practices
for delete to authenticated
using (created_by = (select auth.uid()) and private.has_role((select auth.uid()), 'teacher'));

revoke all on table public.practices from anon, authenticated;
grant select on table public.practices to anon, authenticated;
grant insert, update, delete on table public.practices to authenticated;

drop policy if exists practice_attempts_own_all on public.practice_attempts;
create policy practice_attempts_own_all on public.practice_attempts
for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and private.has_role((select auth.uid()), 'student')
);
revoke all on table public.practice_attempts from anon, authenticated;
grant select, insert, update, delete on table public.practice_attempts to authenticated;

drop policy if exists practice_progress_own_all on public.practice_progress;
create policy practice_progress_own_all on public.practice_progress
for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and private.has_role((select auth.uid()), 'student')
);
revoke all on table public.practice_progress from anon, authenticated;
grant select, insert, update, delete on table public.practice_progress to authenticated;

drop policy if exists favorite_practices_own_all on public.favorite_practices;
create policy favorite_practices_own_all on public.favorite_practices
for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and private.has_role((select auth.uid()), 'student')
);
revoke all on table public.favorite_practices from anon, authenticated;
grant select, insert, update, delete on table public.favorite_practices to authenticated;

create index if not exists practices_published_sort_idx
on public.practices (published, sort_order);
create index if not exists practices_created_by_idx
on public.practices (created_by);
create index if not exists practice_attempts_user_recent_idx
on public.practice_attempts (user_id, created_at desc);
create index if not exists practice_attempts_practice_idx
on public.practice_attempts (practice_id);
create index if not exists practice_progress_user_recent_idx
on public.practice_progress (user_id, last_practiced_at desc);
create index if not exists favorite_practices_user_idx
on public.favorite_practices (user_id, created_at desc);

insert into public.practices (
  id, published, sort_order, source, title, description,
  mediapipe_reference, difficulty, estimated_minutes
) values
  (
    '00000000-0000-4000-8000-000000000101', true, 1, 'system',
    'Saludos básicos',
    'Practica hola, buenos días y gracias en Lengua de Señas Panameña.',
    '{"status":"pending_capture","format":"mediapipe_landmarks"}'::jsonb,
    1, 5
  ),
  (
    '00000000-0000-4000-8000-000000000102', true, 2, 'system',
    'Alfabeto manual',
    'Repasa las configuraciones de la mano para deletrear tu nombre.',
    '{"status":"pending_capture","format":"mediapipe_landmarks"}'::jsonb,
    2, 8
  ),
  (
    '00000000-0000-4000-8000-000000000103', true, 3, 'system',
    'Presentación personal',
    'Combina un saludo, tu nombre y una despedida.',
    '{"status":"pending_capture","format":"mediapipe_landmarks"}'::jsonb,
    2, 10
  )
on conflict (id) do update set
  published = excluded.published,
  sort_order = excluded.sort_order,
  source = excluded.source,
  title = excluded.title,
  description = excluded.description,
  mediapipe_reference = excluded.mediapipe_reference,
  difficulty = excluded.difficulty,
  estimated_minutes = excluded.estimated_minutes;

commit;
