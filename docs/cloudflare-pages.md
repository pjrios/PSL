# Publicar el ZIP en Cloudflare Pages

PSL Visual Builder exporta un sitio estático preconstruido. No requiere un
comando de compilación ni Node.js para publicarse.

## Antes de descargar

El botón **Exportar ZIP** ejecuta una validación compatible con un hosting
estático sensible a mayúsculas y minúsculas. Comprueba:

- `index.html`, `project.json` y el runtime de navegación;
- todas las pantallas declaradas en el manifiesto;
- rutas relativas de imágenes, fuentes, CSS y scripts;
- assets referenciados con el nombre y capitalización exactos.

Si falta un archivo, la descarga se detiene y muestra la primera ruta que debe
corregirse.

## Opción recomendada para estudiantes: arrastrar y soltar

1. Descarga el ZIP desde PSL Visual Builder.
2. Abre **Workers & Pages** en Cloudflare.
3. Selecciona **Create application → Get started → Drag and drop your files**.
4. Escribe un nombre para el proyecto.
5. Arrastra el ZIP completo y selecciona **Deploy site**.
6. Abre la dirección `nombre-del-proyecto.pages.dev`.
7. Comprueba escritorio y teléfono, y recorre todas las conexiones.

Cloudflare Pages admite un ZIP directamente mediante esta modalidad. Para
Wrangler se debe descomprimir primero y subir la carpeta:

```bash
npx wrangler pages deploy carpeta-exportada
```

Documentación oficial:

- [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Límites de Cloudflare Pages](https://developers.cloudflare.com/pages/platform/limits/)

## Lista de aceptación

- La ruta `/` abre la pantalla inicial.
- Los botones navegan entre páginas.
- Regresar usa el historial del navegador.
- Las imágenes y fuentes aparecen sin errores 404.
- El diseño conserva sus cambios de escritorio, tableta y teléfono.
- No se necesita configurar una función, Worker ni comando de build.

La autenticación con Supabase y MediaPipe se añadirán posteriormente. Esas
capacidades sí podrán requerir variables de entorno y configuración adicional.
