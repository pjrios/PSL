# Proyecto editable “Aprende LSP”

Este directorio contiene los artefactos generados del proyecto nativo instalado
en el editor GrapesJS predeterminado.

- `starter-project.json` usa la misma forma que `editor_projects.project_data`:
  datos nativos de GrapesJS en `grapesjs` y la configuración visual de Supabase
  en `supabaseConfig`.
- `aprende-lsp-static.zip` es la exportación secundaria validada y contiene la
  URL y publishable key del proyecto Supabase objetivo. La seguridad efectiva
  sigue dependiendo de las políticas RLS del esquema canónico.

## Abrir y editar

1. Inicia la aplicación, abre el editor y pulsa **+** junto a **Páginas**.
2. Selecciona **Abrir proyecto Aprende LSP** y confirma el reemplazo del sitio
   abierto. El proyecto se carga y guarda mediante el almacenamiento nativo.
3. Usa **Páginas** para recorrer las once páginas. Todo el contenido ordinario
   se puede seleccionar en el lienzo, mover en **Capas** y editar en
   **Estilos** o **Propiedades**.
4. Selecciona un botón para revisar su destino en **Flujo**. Selecciona un
   elemento enlazado o repetido para revisar **Datos**. Selecciona la actividad
   de cámara para abrir **Movimiento**.
5. En **Datos → Configuración de Supabase**, confirma la URL y publishable key
   ya incluidas. No uses una secret key ni una service-role key.
6. Si la base de datos aún no existe, copia exactamente
   `examples/supabase/psl-schema.sql` mediante **Datos → Mis datos → </> SQL** y
   ejecútalo una sola vez en el SQL Editor de Supabase. No se ejecuta
   automáticamente desde este starter.
7. Usa **Vista previa** para probar el recorrido y **Exportar ZIP** después de
   conectar y comprobar las colecciones.

## Límites representados honestamente

La página Bienvenida combina portada, inicio de sesión y registro porque el
exportador actual convierte la página con formulario de acceso en `guestOnly` y
protege todas las demás. Recuperar contraseña, filtros dinámicos, controles
avanzados de video, preferencias persistentes y mutaciones docentes son
prototipos visuales claramente rotulados. Las referencias
`pending_capture`, los medios y las puntuaciones de muestra requieren revisión
por personas conocedoras de Lengua de Señas Panameña antes de un uso educativo
real.
