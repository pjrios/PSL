# Arquitectura modular

## Objetivo

PSL Visual Builder transforma pantallas HTML/CSS en una aplicación navegable y,
en hitos posteriores, añadirá autenticación, MediaPipe y publicación. Cada una
de esas capacidades debe poder evolucionar sin reescribir las demás.

## Principios

1. `project.json` es el contrato estable entre módulos.
2. El HTML, CSS y los assets importados se conservan sin modificaciones
   innecesarias.
3. El núcleo de proyecto no depende de React, GrapesJS, JSZip ni Cloudflare.
4. Cada módulo expone únicamente su API pública mediante `index.ts`.
5. Los módulos no importan archivos internos de otros módulos.
6. El runtime exportado no depende del editor.
7. Las integraciones externas se implementan como adaptadores reemplazables.

Estos límites se comprueban con `npm run check:architecture`. La validación
falla si el núcleo importa frameworks o capas superiores, si el runtime depende
del editor o si un módulo intenta alcanzar los archivos internos de otro.

## Capas

```text
┌──────────────────────────────────────────────────────────────┐
│ app/                 Composición e interfaz principal        │
├──────────────────────────────────────────────────────────────┤
│ modules/             Funciones independientes                │
│ importer · page-catalog · preview · navigation · exporter    │
├──────────────────────────────────────────────────────────────┤
│ core/project         Esquema, tipos y validación              │
├──────────────────────────────────────────────────────────────┤
│ runtime/             Código inyectado en la web exportada     │
└──────────────────────────────────────────────────────────────┘
```

La dirección permitida de dependencias es hacia abajo. `core/project` no puede
importar desde `modules` ni `app`.

## Módulos actuales

### `core/project`

- Define `ProjectSchema` versión 1.
- Valida páginas, pantalla inicial y conexiones.
- Define `ProjectBundle`, representación en memoria de un proyecto importado.
- No contiene interfaz de usuario.

### `modules/importer`

- Recibirá un `Blob` ZIP.
- Devuelve un `ProjectBundle` validado.
- Genera un manifiesto versión 1 si el ZIP no contiene `project.json`.
- Conserva todos los archivos originales en memoria.
- Su API pública es `ProjectImporter`; `ZipProjectImporter` es un adaptador.

### `modules/page-catalog`

- Presenta las páginas disponibles.
- No decide cómo se guardan ni se importan.

### `modules/preview`

- Presenta HTML/CSS en un `iframe` aislado.
- Permite comprobar escritorio, tableta y móvil.
- Genera copias seguras para preview: elimina scripts, bloquea navegación e
  incorpora assets locales como data URLs.
- Nunca modifica el `ProjectBundle` importado.
- No guarda navegación.

### `modules/navigation`

- Administra el formulario y las operaciones inmutables de conexiones.
- Solo escribe conexiones en el manifiesto del proyecto.
- Detecta referencias a elementos o páginas que desaparecieron.

### `modules/exporter`

- Recibirá un `ProjectBundle`.
- Generará un ZIP estático desplegable.
- Su API pública inicial es `ProjectExporter`.

### `runtime`

- Contendrá JavaScript mínimo para los proyectos exportados.
- No conoce la interfaz del editor.

## Módulos futuros

```text
modules/authentication/   Supabase Auth y pantallas protegidas
modules/mediapipe/        Componentes y configuración visual
modules/cloudflare/       Preparación o publicación del build
runtime/authentication/   Sesión en la aplicación exportada
runtime/mediapipe/        Cámara, landmarks y comparación
```

Estos módulos consumirán `core/project`, pero navegación no dependerá de ellos.

## Formato del proyecto

```text
project.zip
├── pages/*.html
├── styles/*.css
├── assets/**
└── project.json
```

La versión del manifiesto se valida explícitamente. Un cambio incompatible
requerirá una nueva versión y una migración, no una reinterpretación silenciosa.

## Decisión sobre el canvas

La primera selección visual utiliza el DOM seguro del `iframe` mediante un
adaptador interno de `preview`. Los identificadores se derivan de la jerarquía
del elemento y se inyectan únicamente en la copia de edición. Los HTML y CSS
originales permanecen intactos.

GrapesJS queda aplazado hasta que exista una necesidad comprobada de modificar
la estructura visual. Si se incorpora, será un adaptador reemplazable y no
formará parte del esquema ni del runtime.
