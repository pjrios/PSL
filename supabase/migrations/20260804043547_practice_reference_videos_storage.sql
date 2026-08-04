-- Private reference videos for teacher-created LSP practices.
-- The object path is always: <teacher-user-id>/<practice-id>/reference.<ext>

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'practice-reference-videos',
  'practice-reference-videos',
  false,
  104857600,
  array['video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists practice_reference_videos_read on storage.objects;
drop policy if exists practice_reference_videos_insert on storage.objects;
drop policy if exists practice_reference_videos_update on storage.objects;
drop policy if exists practice_reference_videos_delete on storage.objects;

create policy practice_reference_videos_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'practice-reference-videos'
  and exists (
    select 1
    from public.practices as practice
    where practice.id::text = (storage.foldername(name))[2]
      and (
        practice.published = true
        or practice.created_by = (select auth.uid())
      )
  )
);

create policy practice_reference_videos_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'practice-reference-videos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and exists (
    select 1
    from public.practices as practice
    where practice.id::text = (storage.foldername(name))[2]
      and practice.created_by = (select auth.uid())
      and private.has_role((select auth.uid()), 'teacher')
  )
);

create policy practice_reference_videos_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'practice-reference-videos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and exists (
    select 1
    from public.practices as practice
    where practice.id::text = (storage.foldername(name))[2]
      and practice.created_by = (select auth.uid())
      and private.has_role((select auth.uid()), 'teacher')
  )
)
with check (
  bucket_id = 'practice-reference-videos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and exists (
    select 1
    from public.practices as practice
    where practice.id::text = (storage.foldername(name))[2]
      and practice.created_by = (select auth.uid())
      and private.has_role((select auth.uid()), 'teacher')
  )
);

create policy practice_reference_videos_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'practice-reference-videos'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and exists (
    select 1
    from public.practices as practice
    where practice.id::text = (storage.foldername(name))[2]
      and practice.created_by = (select auth.uid())
      and private.has_role((select auth.uid()), 'teacher')
  )
);
