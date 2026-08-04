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

## Hito 5 — Edición visual no destructiva

- [x] Migrar `project.json` v1 a v2 durante la importación.
- [x] Guardar contenido y estilos como overrides sin modificar los archivos originales.
- [x] Editar texto, imágenes, enlaces, títulos y etiquetas accesibles.
- [x] Editar propiedades visuales básicas desde el inspector.
- [x] Configurar estados normal, hover, focus y activo.
- [x] Configurar overrides de escritorio, tableta y móvil.
- [x] Deshacer, rehacer y restablecer cambios por elemento.
- [x] Usar el mismo transformador en preview y exportación.
- [x] Exportar CSS generado en `psl-runtime/overrides.css`.
- [ ] Añadir edición estructural: crear, eliminar y reordenar elementos.
- [ ] Sustituir rutas DOM posicionales por identidades resistentes a cambios estructurales.

## Después de navegación

- [x] Añadir una plantilla de acceso con registro, inicio y cierre de sesión.
- [x] Guardar y renovar sesiones de Supabase en preview y exportación.
- [x] Proteger automáticamente todas las páginas salvo la página de acceso.
- [x] Volver a la página solicitada después de iniciar sesión.
- [x] Separar la configuración de autenticación de las tablas de datos.
- [x] Crear colecciones de Supabase mediante un asistente para estudiantes.
- [x] Ocultar SQL, relaciones e identificadores tras opciones avanzadas.
- [x] Generar RLS según dos modos simples: lectura pública y datos propios.
- [x] Comprobar colecciones públicas y autenticadas desde el editor.
- [x] Conectar elementos y listas repetidas con vocabulario no técnico.
- [x] Mostrar estados vacíos y errores de carga en listas repetidas.
- [x] Añadir componentes responsive conectados a tablas mediante un asistente.
- [x] Sugerir y permitir editar el mapeo de columnas a medios, títulos, descripciones e indicadores.
- [x] Incluir cuadrícula, carrusel deslizable, lista y detalle destacado reutilizables.
- [x] Permitir que un campo de medios se muestre como imagen o video.
- [ ] Añadir y editar filas desde PSL mediante formularios protegidos.

La publicación directa en Cloudflare continuará sobre el mismo contrato de
proyecto versionado.

## Análisis de movimiento

- [x] Añadir una actividad genérica y partes editables de entrada, controles y resultados a GrapesJS.
- [x] Separar la configuración condicional en el inspector Movimiento: entrada, referencia, procesamiento, resultado y guardado.
- [x] Admitir los modos analizar, crear referencia y comparar.
- [x] Resolver referencias desde URL o desde campos de una colección existente.
- [x] Ejecutar MediaPipe Holistic en un Web Worker con versión fijada.
- [x] Normalizar, filtrar por confianza, suavizar y reducir secuencias a puntos clave antes de alinearlas mediante DTW.
- [x] Mostrar puntaje general, componentes y retroalimentación inicial localizada por fase.
- [x] Guardar opcionalmente el resultado en una colección Supabase mapeada.
- [x] Incluir la misma funcionalidad en vista previa y exportación ZIP.
- [ ] Calibrar pesos y umbrales con evaluaciones de señantes conocedores.
- [x] Compilar plantillas de referencia localmente desde la vista previa e incrustarlas en el proyecto.
- [ ] Añadir revisión experta, estados de aprobación y versionado de plantillas.
- [ ] Admitir varias referencias aprobadas por movimiento.
- [ ] Validar rendimiento y precisión en los navegadores y dispositivos objetivo.

## Migración a GrapesJS

- [x] Montar GrapesJS open source como editor predeterminado.
- [x] Cargar las páginas y estilos del proyecto de demostración.
- [x] Conservar temporalmente el editor anterior mediante `?legacy=1`.
- [x] Añadir bloques básicos, formularios, navegación y pestañas.
- [x] Añadir edición de imágenes, soporte táctil y exportación ZIP.
- [x] Activar autosave local, assets subidos y cambio de página.
- [x] Organizar Pages/Layers, Canvas y Styles/Properties en un workspace fijo.
- [x] Mover Blocks y acciones secundarias a drawer y menú temporal.
- [ ] Sustituir el modelo de overrides por datos de proyecto de GrapesJS.
- [ ] Conectar importación y exportación genéricas.
- [ ] Simplificar progresivamente los paneles nativos para usuarios no técnicos.
