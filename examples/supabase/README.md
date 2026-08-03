# Importar el esquema real de PSL

1. Abre el editor del sitio y entra en **Datos → Mis datos → `</> SQL`**.
2. Copia todo `psl-schema.sql`, pégalo y selecciona **Importar y mostrar visualmente**.
3. Confirma que aparezcan seis colecciones: `profiles`, `user_roles`,
   `practices`, `practice_attempts`, `practice_progress` y
   `favorite_practices`.
4. En Supabase, abre **SQL Editor**, pega exactamente el mismo archivo y
   presiona **Run** una sola vez.
5. En el editor del sitio configura la URL y la publishable key del proyecto.
6. Abre cada colección pública o de usuario y selecciona
   **Conectar → Comprobar colección**.

`user_roles` se importa como privada intencionalmente. Los usuarios pueden leer
su propio rol desde la aplicación, pero no pueden asignarse el rol de docente.
Un administrador puede convertir una cuenta existente en docente con:

```sql
insert into public.user_roles (user_id, role)
values ('UUID_DEL_USUARIO', 'teacher')
on conflict (user_id, role) do nothing;
```

No se crea una tabla `recent`. Las prácticas recientes son los últimos intentos:

```sql
select practice_id, score, created_at
from public.practice_attempts
where user_id = auth.uid()
order by created_at desc
limit 3;
```
