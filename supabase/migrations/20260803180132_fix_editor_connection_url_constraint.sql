alter table public.editor_supabase_connections
drop constraint if exists editor_supabase_connections_url_format;

alter table public.editor_supabase_connections
add constraint editor_supabase_connections_url_format
check (project_url ~ '^https://[a-z0-9]{20}[.]supabase[.]co/?$');
