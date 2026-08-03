-- Editor platform accounts, saved projects, and encrypted external Supabase connections.

create schema if not exists editor_private;
revoke all on schema editor_private from public, anon, authenticated;

create table if not exists public.editor_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Estudiante',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.editor_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Mi sitio',
  project_data jsonb not null default '{}'::jsonb,
  last_opened_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.editor_supabase_connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  editor_project_id uuid not null references public.editor_projects(id) on delete cascade,
  project_ref text not null,
  project_url text not null,
  publishable_key text not null,
  secret_hint text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint editor_supabase_connections_project_key unique (editor_project_id),
  constraint editor_supabase_connections_ref_format check (project_ref ~ '^[a-z0-9]{20}$'),
  constraint editor_supabase_connections_url_format check (project_url ~ '^https://[a-z0-9]{20}[.]supabase[.]co/?$'),
  constraint editor_supabase_connections_publishable_key check (
    publishable_key like 'sb_publishable_%'
  )
);

-- Ciphertext is separated from user-readable connection metadata. Browser roles
-- receive no table privileges and there are deliberately no RLS policies.
create table if not exists public.editor_connection_secrets (
  connection_id uuid primary key references public.editor_supabase_connections(id) on delete cascade,
  ciphertext text not null,
  initialization_vector text not null,
  algorithm text not null default 'AES-GCM-256',
  key_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists editor_projects_owner_updated_idx
on public.editor_projects (owner_id, updated_at desc);

create index if not exists editor_supabase_connections_owner_idx
on public.editor_supabase_connections (owner_id);

alter table public.editor_profiles enable row level security;
alter table public.editor_projects enable row level security;
alter table public.editor_supabase_connections enable row level security;
alter table public.editor_connection_secrets enable row level security;

revoke all on table public.editor_profiles from anon, authenticated;
revoke all on table public.editor_projects from anon, authenticated;
revoke all on table public.editor_supabase_connections from anon, authenticated;
revoke all on table public.editor_connection_secrets from anon, authenticated;

grant all on table public.editor_profiles to service_role;
grant all on table public.editor_projects to service_role;
grant all on table public.editor_supabase_connections to service_role;
grant all on table public.editor_connection_secrets to service_role;

grant select on table public.editor_profiles to authenticated;
grant update (display_name) on table public.editor_profiles to authenticated;

grant select, insert, update, delete on table public.editor_projects to authenticated;

grant select (
  id,
  owner_id,
  editor_project_id,
  project_ref,
  project_url,
  publishable_key,
  secret_hint,
  verified_at,
  created_at,
  updated_at
) on table public.editor_supabase_connections to authenticated;

create policy editor_profiles_read_own
on public.editor_profiles
for select to authenticated
using ((select auth.uid()) = user_id);

create policy editor_profiles_update_own
on public.editor_profiles
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy editor_projects_read_own
on public.editor_projects
for select to authenticated
using ((select auth.uid()) = owner_id);

create policy editor_projects_insert_own
on public.editor_projects
for insert to authenticated
with check ((select auth.uid()) = owner_id);

create policy editor_projects_update_own
on public.editor_projects
for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create policy editor_projects_delete_own
on public.editor_projects
for delete to authenticated
using ((select auth.uid()) = owner_id);

create policy editor_supabase_connections_read_own
on public.editor_supabase_connections
for select to authenticated
using ((select auth.uid()) = owner_id);

create or replace function editor_private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function editor_private.handle_new_editor_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.editor_profiles (user_id, display_name)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(new.email, ''), '@', 1), 'Estudiante')
  )
  on conflict (user_id) do nothing;

  insert into public.editor_projects (owner_id, name)
  values (new.id, 'Mi primer sitio');

  return new;
end;
$$;

revoke all on function editor_private.handle_new_editor_user() from public;
revoke all on function editor_private.set_updated_at() from public;

drop trigger if exists editor_profiles_set_updated_at on public.editor_profiles;
create trigger editor_profiles_set_updated_at
before update on public.editor_profiles
for each row execute function editor_private.set_updated_at();

drop trigger if exists editor_projects_set_updated_at on public.editor_projects;
create trigger editor_projects_set_updated_at
before update on public.editor_projects
for each row execute function editor_private.set_updated_at();

drop trigger if exists editor_connections_set_updated_at on public.editor_supabase_connections;
create trigger editor_connections_set_updated_at
before update on public.editor_supabase_connections
for each row execute function editor_private.set_updated_at();

drop trigger if exists editor_connection_secrets_set_updated_at on public.editor_connection_secrets;
create trigger editor_connection_secrets_set_updated_at
before update on public.editor_connection_secrets
for each row execute function editor_private.set_updated_at();

drop trigger if exists on_editor_auth_user_created on auth.users;
create trigger on_editor_auth_user_created
after insert on auth.users
for each row execute function editor_private.handle_new_editor_user();

-- Backfill accounts that existed before this editor schema was installed.
insert into public.editor_profiles (user_id, display_name)
select
  id,
  coalesce(nullif(raw_user_meta_data ->> 'display_name', ''), split_part(coalesce(email, ''), '@', 1), 'Estudiante')
from auth.users
on conflict (user_id) do nothing;

insert into public.editor_projects (owner_id, name)
select users.id, 'Mi primer sitio'
from auth.users as users
where not exists (
  select 1 from public.editor_projects as projects where projects.owner_id = users.id
);
