# PSL Visual Builder

Editor visual modular para convertir pantallas diseñadas en Figma y exportadas
como HTML/CSS en aplicaciones web navegables. En etapas posteriores incorporará
autenticación con Supabase, componentes MediaPipe y exportación para Cloudflare.

## Estado

El repositorio completó la validación local principal del **Hito 4 — Robustez
responsive**. Incluye:

- Shell visual del editor.
- Tres pantallas responsive de demostración.
- Vista previa en escritorio, tableta y móvil.
- Esquema validado para `project.json` versión 1.
- Límites modulares para importación, navegación, preview y exportación.
- Importación de proyectos ZIP completamente en el navegador.
- Creación automática de `project.json` cuando no esté presente.
- Vista previa segura de HTML/CSS y assets locales.
- Selección visual de elementos sin modificar los archivos importados.
- Acciones para navegar, regresar y abrir una URL.
- Conexiones editables almacenadas en `project.json`.
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

Para cerrar la aceptación externa del Hito 4 falta probar un ZIP producido
desde un diseño real del equipo y verificar el resultado en una URL de
Cloudflare Pages.

## Ejecutar localmente

Requiere una versión LTS reciente de Node.js.

```bash
npm install
npm run dev
```

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

Supabase y MediaPipe permanecerán fuera del núcleo de navegación y se añadirán
como módulos independientes después de validar este flujo.
