# PSL Visual Builder

Editor visual modular para convertir pantallas diseñadas en Figma y exportadas
como HTML/CSS en aplicaciones web navegables. Incluye autenticación con
Supabase, análisis de movimiento con MediaPipe y, en etapas posteriores,
publicación directa.

## Estado

El repositorio completó la validación local principal del **Hito 4 — Robustez
responsive**. Incluye:

- Shell visual del editor.
- Tres pantallas responsive de demostración.
- Vista previa en escritorio, tableta y móvil.
- Esquema validado para `project.json` versión 2 con migración automática desde v1.
- Límites modulares para importación, navegación, preview y exportación.
- Importación de proyectos ZIP completamente en el navegador.
- Creación automática de `project.json` cuando no esté presente.
- Vista previa segura de HTML/CSS y assets locales.
- Selección visual de elementos sin modificar los archivos importados.
- Acciones para navegar, regresar y abrir una URL.
- Conexiones editables almacenadas en `project.json`.
- Fuentes de datos estáticas o REST con referencias de registro genéricas.
- Página de acceso con registro, inicio y cierre de sesión mediante Supabase.
- Protección automática de las demás páginas y retorno después de iniciar sesión.
- Listas repetidas que reutilizan una plantilla HTML por cada registro.
- Navegación con contexto y vínculos seguros de campos hacia texto, imágenes y atributos.
- Edición no destructiva de texto, imágenes, enlaces y atributos accesibles.
- Inspector de estilos para estados normal, hover, focus y activo.
- Overrides separados para escritorio, tableta y móvil.
- Historial de deshacer/rehacer y restablecimiento por elemento.
- Exportación de contenido editado y CSS generado en `psl-runtime/overrides.css`.
- Advertencias para conexiones cuyos elementos desaparecieron.
- Modos separados para editar y probar la aplicación.
- Navegación funcional e historial dentro de la vista previa.
- Exportación ZIP con una entrada `index.html` para hosting estático.
- Runtime independiente compartido por la prueba y la exportación.
- Reimportación sin pérdida ni duplicación de conexiones.
- Importación de HTML ubicado en la raíz o en carpetas anidadas.
- Preservación de stylesheets enlazados, media queries, fuentes y assets.
- Validación de rutas estáticas sensible a mayúsculas antes de descargar.
- Prueba integral del flujo completo con un fixture compatible con FigmaToCode.
- Sistema genérico de movimiento con partes editables, modos de análisis,
  creación de referencias y comparación, además de guardado opcional.

Para cerrar la aceptación externa del Hito 4 falta probar un ZIP producido
desde un diseño real del equipo y verificar el resultado en una URL de
Cloudflare Pages.

## Ejecutar localmente

Requiere una versión LTS reciente de Node.js.

```bash
npm install
npm run dev
```

El editor requiere su propio proyecto de Supabase para las cuentas y los sitios
guardados. Copie `.env.example` a `.env.local` y configure la URL y la
publishable key. El esquema y la función serverless se administran con:

```bash
supabase link --project-ref <project-ref>
supabase db push --linked
supabase secrets set EDITOR_CONNECTION_ENCRYPTION_KEY=<base64-de-32-bytes>
supabase functions deploy manage-editor-connection --use-api
```

Las secret keys de proyectos externos se cifran antes de guardarse. El
navegador solamente puede leer metadatos enmascarados; la tabla de ciphertext
no concede acceso a `anon` ni a `authenticated`.

Validación:

```bash
npm run typecheck
npm test
npm run build
```

La comprobación completa, incluyendo límites modulares, es:

```bash
npm run check
```

## Arquitectura

```text
src/
├── app/                 Composición de la interfaz
├── core/project/        Contrato y validación independientes
├── demo/                Adaptador del proyecto de ejemplo
├── modules/
│   ├── design/          Contenido, estilos, estados y overrides responsive
│   ├── data/            Fuentes, registros, listas repetidas y vínculos
│   ├── importer/        Entrada ZIP
│   ├── page-catalog/    Lista de pantallas
│   ├── preview/         Vista segura y responsive
│   ├── navigation/      Edición y validación de conexiones visuales
│   └── exporter/        Salida ZIP desplegable
└── runtime/             Navegación compartida entre prueba y exportación
```

Consulte [docs/architecture.md](docs/architecture.md) para los límites de los
módulos y [docs/roadmap.md](docs/roadmap.md) para el progreso.

## Proyecto de ejemplo

El editor GrapesJS predeterminado abre ahora el starter nativo de aprendizaje de
Lengua de Señas Panameña con once páginas editables, Flujo, colecciones de la
base canónica y dos actividades de movimiento. Los artefactos reproducibles y
la guía de apertura están en
[`examples/lsp-learning-grapesjs`](examples/lsp-learning-grapesjs/README.md).

`examples/three-screen-demo` contiene Inicio, Catálogo y Práctica junto con CSS
responsive y un manifiesto válido. `examples/figma-responsive-export` reproduce
una salida de diseño con HTML en la raíz, CSS enlazado, fuente, SVG y media
queries.

Los proyectos importados deben seguir inicialmente esta estructura:

```text
project.zip
├── **/*.html
├── styles/*.css
├── assets/**
└── project.json       opcional
```

Si no existe `project.json`, el importador crea uno usando los HTML encontrados
en cualquier carpeta segura. Los archivos importados no se modifican durante
la vista previa.

## Alcance actual

El flujo de edición disponible es:

```text
Importar → seleccionar → conectar → probar → exportar
```

Los cinco pasos están disponibles. El ZIP resultante incluye una página de
entrada y puede servirse como un sitio estático.

La guía de publicación manual está en
[docs/cloudflare-pages.md](docs/cloudflare-pages.md).

La guía de pantallas impulsadas por datos está en
[docs/data-driven-pages.md](docs/data-driven-pages.md).

La autenticación permanece separada del núcleo de navegación y las políticas
RLS siguen siendo la barrera real para proteger datos. El componente de
movimiento ejecuta MediaPipe Holistic en el navegador y también funciona sin
una conexión de datos cuando utiliza una referencia por URL.
