# PSL Visual Builder

Editor visual modular para convertir pantallas diseñadas en Figma y exportadas
como HTML/CSS en aplicaciones web navegables. En etapas posteriores incorporará
autenticación con Supabase, componentes MediaPipe y exportación para Cloudflare.

## Estado

El repositorio completó localmente el **Hito 2 — Navegación visual**. Incluye:

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

La ejecución real de las conexiones y la descarga del proyecto corresponden al
Hito 3.

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
│   └── exporter/        Salida ZIP
└── runtime/             Código para la aplicación exportada
```

Consulte [docs/architecture.md](docs/architecture.md) para los límites de los
módulos y [docs/roadmap.md](docs/roadmap.md) para el progreso.

## Proyecto de ejemplo

`examples/three-screen-demo` contiene Inicio, Catálogo y Práctica junto con CSS
responsive y un manifiesto válido. Este fixture será la primera entrada del
importador ZIP.

Los proyectos importados deben seguir inicialmente esta estructura:

```text
project.zip
├── pages/*.html
├── styles/*.css
├── assets/**
└── project.json       opcional
```

Si no existe `project.json`, el importador crea uno usando los HTML encontrados
en `pages/`. Los archivos importados no se modifican durante la vista previa.

## Alcance actual

El flujo de edición disponible es:

```text
Importar → seleccionar → conectar → probar → exportar
```

Actualmente están disponibles los tres primeros pasos. Probar y exportar se
implementarán en el Hito 3.

Supabase y MediaPipe permanecerán fuera del núcleo de navegación y se añadirán
como módulos independientes después de validar este flujo.
