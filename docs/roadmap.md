# Roadmap

## Hito 0 — Fundación modular

- [x] Proyecto React, Vite y TypeScript.
- [x] Estructura modular con APIs públicas.
- [x] Contrato `project.json` versión 1.
- [x] Validación de páginas y conexiones.
- [x] Proyecto de ejemplo con tres pantallas responsive.
- [x] Shell visual del editor.
- [x] Vista previa de escritorio, tableta y móvil.
- [x] Pruebas del esquema.
- [x] Documentación de arquitectura.
- [x] Workflow de CI y comprobación de límites modulares.
- [x] Confirmar la primera ejecución de CI después del push.

## Hito 1 — Importación

- [x] Importar un ZIP en el navegador.
- [x] Validar estructura y `project.json`.
- [x] Crear un manifiesto cuando no exista.
- [x] Resolver rutas de HTML, CSS y assets.
- [x] Bloquear scripts durante la edición sin modificar los archivos originales.
- [x] Informar errores de importación con claridad.
- [x] Pruebas del importador y la vista previa segura.

## Hito 2 — Navegación visual

- [x] Seleccionar elementos del HTML.
- [x] Asignar identificadores estables.
- [x] Configurar navegar, regresar y abrir URL.
- [x] Guardar conexiones sin modificar CSS.
- [x] Mostrar advertencias por conexiones rotas.

## Hito 3 — Prueba y exportación

- [x] Alternar entre Editar y Probar.
- [x] Ejecutar navegación real en la vista previa.
- [x] Generar runtime de navegación independiente.
- [x] Exportar ZIP estático.
- [x] Reimportar sin perder conexiones.

## Hito 4 — Robustez responsive

- [x] Probar un paquete HTML/CSS normalizado compatible con FigmaToCode.
- [ ] Repetir la aceptación con un ZIP generado desde un diseño real en Figma.
- [x] Preservar media queries, fuentes y assets.
- [x] Prueba integral de importar, conectar, exportar, reimportar y navegar.
- [x] Validar rutas y estructura con el contrato estático de Cloudflare Pages.
- [ ] Desplegar el ZIP y verificarlo en una URL real de Cloudflare Pages.

## Después de navegación

Los módulos de autenticación, MediaPipe y Cloudflare se planificarán después de
cerrar los cuatro hitos anteriores. Cada módulo utilizará el mismo contrato de
proyecto versionado.
