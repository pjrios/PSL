-- Representative development/test data for examples/supabase/psl-schema.sql.
-- Run the schema first, then run this file in Supabase SQL Editor.
--
-- Development and staging only. The three auth.users rows are placeholders and
-- cannot sign in because they have no password. Create login-capable test users
-- through Supabase Auth if you need to exercise RLS from the application.
--
-- This script is repeatable: all fixture rows use stable UUIDs and are upserted.

begin;

-- Placeholder accounts. Inserting these fires private.handle_new_user(), which
-- creates each profile and its student role.
insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'ana.estudiante@example.invalid',
    '{"display_name":"Ana Martínez"}'::jsonb,
    '2026-06-01 13:00:00+00'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'luis.estudiante@example.invalid',
    '{"display_name":"Luis González"}'::jsonb,
    '2026-06-03 15:30:00+00'
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'sofia.docente@example.invalid',
    '{"display_name":"Prof. Sofía Rivera"}'::jsonb,
    '2026-05-20 12:15:00+00'
  )
on conflict (id) do update set
  raw_user_meta_data = excluded.raw_user_meta_data,
  email_confirmed_at = excluded.email_confirmed_at,
  updated_at = now();

insert into public.profiles (user_id, display_name, bio)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'Ana Martínez',
    'Estudiante principiante practicando saludos y el alfabeto manual.'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'Luis González',
    'Estudiante de nivel intermedio interesado en conversaciones cotidianas.'
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'Prof. Sofía Rivera',
    'Docente de Lengua de Señas Panameña.'
  )
on conflict (user_id) do update set
  display_name = excluded.display_name,
  bio = excluded.bio;

-- The teacher remains a student too, matching the schema's dual-role model.
insert into public.user_roles (user_id, role)
values ('10000000-0000-4000-8000-000000000003', 'teacher')
on conflict (user_id, role) do nothing;

-- Extra system practices exercise every difficulty level, null/non-null
-- descriptions, published/draft visibility, and MediaPipe capture states.
-- A reference is ready only when the JSON contains a version 2 `frames` array;
-- metadata by itself must remain pending_capture.
insert into public.practices (
  id, published, sort_order, created_at, created_by, source, title,
  description, media_url, mediapipe_reference, difficulty,
  estimated_minutes, updated_at
)
values
  (
    '00000000-0000-4000-8000-000000000104', true, 4,
    '2026-06-05 14:00:00+00', null, 'system', 'Números del 1 al 10',
    'Practica los números básicos con ritmo uniforme y configuraciones claras.',
    null,
    '{"status":"pending_capture","format":"mediapipe_landmarks","hands":1,"target_fps":30}'::jsonb,
    1, 6, '2026-06-05 14:00:00+00'
  ),
  (
    '00000000-0000-4000-8000-000000000105', true, 5,
    '2026-06-06 14:00:00+00', null, 'system', 'La familia',
    'Aprende las señas para mamá, papá, hermana, hermano y familia.',
    null,
    '{"status":"pending_capture","format":"mediapipe_landmarks","hands":2,"target_fps":30}'::jsonb,
    2, 8, '2026-06-06 14:00:00+00'
  ),
  (
    '00000000-0000-4000-8000-000000000106', true, 6,
    '2026-06-07 14:00:00+00', null, 'system', 'Días de la semana',
    'Repasa los siete días y úsalos para describir una rutina semanal.',
    null,
    '{"status":"pending_capture","format":"mediapipe_landmarks"}'::jsonb,
    3, 12, '2026-06-07 14:00:00+00'
  ),
  (
    '00000000-0000-4000-8000-000000000107', true, 7,
    '2026-06-08 14:00:00+00', null, 'system', 'Preguntas cotidianas',
    'Practica expresiones faciales y señas para qué, quién, dónde y cuándo.',
    null,
    '{"status":"pending_capture","format":"mediapipe_landmarks","hands":2,"includes_face":true}'::jsonb,
    4, 15, '2026-06-08 14:00:00+00'
  ),
  (
    '00000000-0000-4000-8000-000000000108', true, 8,
    '2026-06-09 14:00:00+00', null, 'system', 'Conversación en la escuela',
    'Completa una secuencia de preguntas y respuestas sobre la vida escolar.',
    null,
    '{"status":"pending_capture","format":"mediapipe_landmarks","hands":2,"includes_face":true,"includes_pose":true}'::jsonb,
    5, 20, '2026-06-09 14:00:00+00'
  ),
  (
    '00000000-0000-4000-8000-000000000109', false, 9,
    '2026-06-10 14:00:00+00', null, 'system', 'Emociones (próximamente)',
    null,
    null,
    '{"status":"draft","format":"mediapipe_landmarks"}'::jsonb,
    3, null, '2026-06-10 14:00:00+00'
  ),
  (
    '00000000-0000-4000-8000-000000000190', true, 20,
    '2026-07-01 16:00:00+00',
    '10000000-0000-4000-8000-000000000003', 'teacher',
    'Repaso: presentarse en clase',
    'Actividad creada por la docente para practicar una presentación breve.',
    null,
    '{"status":"pending_capture","format":"mediapipe_landmarks","hands":2,"includes_face":true}'::jsonb,
    2, 10, '2026-07-02 16:00:00+00'
  ),
  (
    '00000000-0000-4000-8000-000000000191', false, 21,
    '2026-07-20 16:00:00+00',
    '10000000-0000-4000-8000-000000000003', 'teacher',
    'Actividad del Día del Niño',
    'Borrador docente que permite comprobar la vista de contenido sin publicar.',
    null,
    '{"status":"pending_capture","format":"mediapipe_landmarks"}'::jsonb,
    3, 15, '2026-07-20 16:00:00+00'
  )
on conflict (id) do update set
  published = excluded.published,
  sort_order = excluded.sort_order,
  created_by = excluded.created_by,
  source = excluded.source,
  title = excluded.title,
  description = excluded.description,
  media_url = excluded.media_url,
  mediapipe_reference = excluded.mediapipe_reference,
  difficulty = excluded.difficulty,
  estimated_minutes = excluded.estimated_minutes,
  updated_at = excluded.updated_at;

-- Attempt history: varied scores, null scores, feedback, durations, and
-- MediaPipe results make recent-activity and result screens realistic.
insert into public.practice_attempts (
  id, user_id, created_at, practice_id, score, feedback,
  mediapipe_result, duration_seconds
)
values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '2026-07-20 18:05:00+00', '00000000-0000-4000-8000-000000000101', 58, 'Mantén la mano dentro del encuadre.', '{"confidence":0.61,"matched_frames":84,"total_frames":140}'::jsonb, 92),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '2026-07-23 18:10:00+00', '00000000-0000-4000-8000-000000000101', 81, 'Buen ritmo; revisa la orientación de la palma.', '{"confidence":0.84,"matched_frames":126,"total_frames":150}'::jsonb, 78),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '2026-07-29 18:15:00+00', '00000000-0000-4000-8000-000000000101', 95, 'Excelente precisión y expresión.', '{"confidence":0.96,"matched_frames":145,"total_frames":150}'::jsonb, 64),
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '2026-07-30 18:20:00+00', '00000000-0000-4000-8000-000000000102', null, 'Intento interrumpido antes de terminar.', '{"status":"cancelled","captured_frames":38}'::jsonb, 21),
  ('30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '2026-08-01 18:25:00+00', '00000000-0000-4000-8000-000000000102', 72, 'Practica de nuevo las letras M, N y R.', '{"confidence":0.74,"matched_frames":111,"total_frames":150}'::jsonb, 135),
  ('30000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', '2026-07-18 21:00:00+00', '00000000-0000-4000-8000-000000000101', 70, 'La secuencia es correcta; reduce la velocidad.', '{"confidence":0.72,"matched_frames":108,"total_frames":150}'::jsonb, 88),
  ('30000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000002', '2026-07-22 21:05:00+00', '00000000-0000-4000-8000-000000000101', 88, 'Muy buen control del movimiento.', '{"confidence":0.89,"matched_frames":134,"total_frames":150}'::jsonb, 73),
  ('30000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000002', '2026-07-27 21:10:00+00', '00000000-0000-4000-8000-000000000103', 61, 'Incluye una pausa clara entre el nombre y la despedida.', '{"confidence":0.65,"matched_frames":117,"total_frames":180}'::jsonb, 112),
  ('30000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000002', '2026-07-28 21:15:00+00', '00000000-0000-4000-8000-000000000106', 79, 'Buen comienzo; revisa martes y miércoles.', '{"confidence":0.80,"matched_frames":144,"total_frames":180}'::jsonb, 148),
  ('30000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000002', '2026-08-02 21:20:00+00', '00000000-0000-4000-8000-000000000106', 92, 'Secuencia completa y fluida.', '{"confidence":0.93,"matched_frames":167,"total_frames":180}'::jsonb, 121),
  ('30000000-0000-4000-8000-000000000011', '10000000-0000-4000-8000-000000000003', '2026-07-25 15:00:00+00', '00000000-0000-4000-8000-000000000101', 55, 'Ajusta la posición inicial de la mano.', '{"confidence":0.58,"matched_frames":87,"total_frames":150}'::jsonb, 96),
  ('30000000-0000-4000-8000-000000000012', '10000000-0000-4000-8000-000000000003', '2026-07-26 15:05:00+00', '00000000-0000-4000-8000-000000000105', 82, 'Buena claridad en las señas de parentesco.', '{"confidence":0.84,"matched_frames":151,"total_frames":180}'::jsonb, 132),
  ('30000000-0000-4000-8000-000000000013', '10000000-0000-4000-8000-000000000003', '2026-07-31 15:10:00+00', '00000000-0000-4000-8000-000000000105', 96, 'Excelente dominio de la actividad.', '{"confidence":0.97,"matched_frames":175,"total_frames":180}'::jsonb, 105)
on conflict (id) do update set
  user_id = excluded.user_id,
  created_at = excluded.created_at,
  practice_id = excluded.practice_id,
  score = excluded.score,
  feedback = excluded.feedback,
  mediapipe_result = excluded.mediapipe_result,
  duration_seconds = excluded.duration_seconds;

insert into public.practice_progress (
  id, user_id, created_at, practice_id, status, best_score,
  attempts_count, last_practiced_at
)
values
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '2026-07-20 18:05:00+00', '00000000-0000-4000-8000-000000000101', 'completed', 95, 3, '2026-07-29 18:15:00+00'),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '2026-07-30 18:20:00+00', '00000000-0000-4000-8000-000000000102', 'in_progress', 72, 2, '2026-08-01 18:25:00+00'),
  ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '2026-08-01 18:30:00+00', '00000000-0000-4000-8000-000000000104', 'not_started', null, 0, null),
  ('40000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', '2026-07-18 21:00:00+00', '00000000-0000-4000-8000-000000000101', 'completed', 88, 2, '2026-07-22 21:05:00+00'),
  ('40000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000002', '2026-07-27 21:10:00+00', '00000000-0000-4000-8000-000000000103', 'in_progress', 61, 1, '2026-07-27 21:10:00+00'),
  ('40000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', '2026-07-28 21:15:00+00', '00000000-0000-4000-8000-000000000106', 'completed', 92, 2, '2026-08-02 21:20:00+00'),
  ('40000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000003', '2026-07-25 15:00:00+00', '00000000-0000-4000-8000-000000000101', 'in_progress', 55, 1, '2026-07-25 15:00:00+00'),
  ('40000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000003', '2026-07-26 15:05:00+00', '00000000-0000-4000-8000-000000000105', 'completed', 96, 2, '2026-07-31 15:10:00+00'),
  ('40000000-0000-4000-8000-000000000009', '10000000-0000-4000-8000-000000000003', '2026-08-01 15:15:00+00', '00000000-0000-4000-8000-000000000108', 'not_started', null, 0, null)
on conflict (user_id, practice_id) do update set
  status = excluded.status,
  best_score = excluded.best_score,
  attempts_count = excluded.attempts_count,
  last_practiced_at = excluded.last_practiced_at;

insert into public.favorite_practices (id, user_id, created_at, practice_id)
values
  ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '2026-07-21 13:00:00+00', '00000000-0000-4000-8000-000000000101'),
  ('50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '2026-07-30 13:00:00+00', '00000000-0000-4000-8000-000000000104'),
  ('50000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '2026-07-24 13:00:00+00', '00000000-0000-4000-8000-000000000103'),
  ('50000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000002', '2026-07-29 13:00:00+00', '00000000-0000-4000-8000-000000000106'),
  ('50000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000003', '2026-07-27 13:00:00+00', '00000000-0000-4000-8000-000000000105')
on conflict (user_id, practice_id) do update set
  created_at = excluded.created_at;

-- Fail atomically if a future edit makes the fixture internally inconsistent.
do $$
begin
  if (
    select count(*)
    from auth.users
    where id in (
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000003'
    )
  ) <> 3 then
    raise exception 'PSL fixture check failed: expected 3 users';
  end if;

  if (
    select count(*)
    from public.practices
    where id in (
      '00000000-0000-4000-8000-000000000104',
      '00000000-0000-4000-8000-000000000105',
      '00000000-0000-4000-8000-000000000106',
      '00000000-0000-4000-8000-000000000107',
      '00000000-0000-4000-8000-000000000108',
      '00000000-0000-4000-8000-000000000109',
      '00000000-0000-4000-8000-000000000190',
      '00000000-0000-4000-8000-000000000191'
    )
  ) <> 8 then
    raise exception 'PSL fixture check failed: expected 8 practices';
  end if;

  if (
    select count(*)
    from public.practice_attempts
    where id::text like '30000000-0000-4000-8000-0000000000%'
  ) <> 13 then
    raise exception 'PSL fixture check failed: expected 13 attempts';
  end if;

  if exists (
    select 1
    from public.practice_progress as progress
    where progress.id::text like '40000000-0000-4000-8000-0000000000%'
      and (
        progress.attempts_count <> (
          select count(*)
          from public.practice_attempts as attempt
          where attempt.user_id = progress.user_id
            and attempt.practice_id = progress.practice_id
        )
        or progress.best_score is distinct from (
          select max(attempt.score)
          from public.practice_attempts as attempt
          where attempt.user_id = progress.user_id
            and attempt.practice_id = progress.practice_id
        )
      )
  ) then
    raise exception 'PSL fixture check failed: progress does not match attempts';
  end if;
end;
$$;

commit;

-- Optional cleanup (run separately; do not uncomment casually):
-- delete from public.practices
-- where id in (
--   '00000000-0000-4000-8000-000000000190',
--   '00000000-0000-4000-8000-000000000191'
-- );
-- delete from auth.users
-- where id in (
--   '10000000-0000-4000-8000-000000000001',
--   '10000000-0000-4000-8000-000000000002',
--   '10000000-0000-4000-8000-000000000003'
-- );
-- delete from public.practices
-- where id between '00000000-0000-4000-8000-000000000104'
--              and '00000000-0000-4000-8000-000000000109';
