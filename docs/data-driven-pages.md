# Pantallas impulsadas por datos

PSL usa conceptos genéricos para que una misma pantalla funcione con productos,
lecciones, personas, recetas u otros registros. El HTML no necesita conocer el
origen de los datos.

## Flujo para estudiantes

La interfaz llama **colección** a una tabla y **elemento** a una fila. El flujo
predeterminado no requiere conocer SQL:

1. Conectar la URL y la publishable key del proyecto de Supabase.
2. Crear una colección desde Productos, Libros, Proyectos, Eventos o Desde cero.
3. Elegir la información de cada elemento y quién puede verla.
4. Copiar la configuración, ejecutarla una vez en el SQL Editor de Supabase y
   comprobar la colección desde PSL.
5. Seleccionar un contenedor para mostrar uno por cada elemento y conectar sus
   textos o imágenes con la información de la colección.

Las relaciones, los identificadores internos, los campos automáticos y el SQL
permanecen en las opciones avanzadas. Después de comprobar una colección, PSL
bloquea el cambio o la eliminación de campos instalados; se pueden añadir campos
nuevos sin afectar los datos existentes.

Una colección pública solo muestra filas con `published = true`. Si está vacía,
el sitio muestra un estado vacío comprensible en lugar de desaparecer el diseño.
Las colecciones propias del usuario se comprueban con la sesión iniciada guardada
por la vista previa.

## Componentes responsive con datos

Desde **Añadir → Supabase → Datos dinámicos**, el estudiante puede comenzar por el
diseño en vez de conectar elementos manualmente:

Al seleccionar o arrastrar un bloque, la biblioteca **Añadir** se cierra
automáticamente. Para **Datos dinámicos**, se abre de inmediato el asistente de
configuración sin dejar un bloque provisional en la página.

1. Elegir cuadrícula de tarjetas, carrusel deslizable, lista visual o detalle
   destacado. Todos incluyen reglas para escritorio, tableta y móvil.
2. Elegir una tabla registrada en el proyecto o crear una nueva con el asistente.
3. Confirmar qué columnas alimentan el medio, título, descripción e indicador.
4. Elegir si el medio debe mostrarse como imagen o video con controles.
5. Elegir el máximo por página y las columnas de escritorio, tableta y móvil.
   PSL calcula las filas; con 12 elementos usa 4 × 3, 4 × 3 y 2 × 6 por defecto.
6. Activar **Anterior y Siguiente** para mostrar controles únicamente cuando
   existan más registros.
7. Añadir el componente a la página. PSL crea automáticamente los repetidores,
   vínculos y estilos que usan la vista previa y la exportación.

Las sugerencias usan los nombres y tipos de las columnas, pero siempre se pueden
cambiar o desactivar. La cuadrícula, el carrusel y la lista repiten registros; el
detalle destacado usa el primer registro disponible hasta que se conecte con el
contexto seleccionado de otra página.

La paginación consulta solamente la página actual. En Supabase se envían `limit`
y `offset`, solicitando un registro adicional para saber si debe habilitarse
**Siguiente**.

La publishable key no se usa para inspeccionar todo el esquema remoto. La lista
muestra las tablas creadas o registradas en el proyecto PSL; esto evita solicitar
una secret key en el navegador.

## Fuentes

Una fuente estática almacena registros dentro de `project.json`:

```json
{
  "id": "items",
  "name": "Items",
  "type": "static",
  "records": [{ "id": "one", "name": "Primer item" }]
}
```

Una fuente REST usa un endpoint de lista y una plantilla para consultar un
registro. `{id}` se reemplaza de forma segura:

```json
{
  "id": "items",
  "name": "Items",
  "type": "rest",
  "listUrl": "https://api.example.com/items",
  "recordUrl": "https://api.example.com/items/{id}"
}
```

Los endpoints REST deben permitir CORS. Credenciales privadas y SQL nunca deben
incluirse en el ZIP; las bases de datos autenticadas necesitan una API o función
de servidor que aplique autorización.

## Listas repetidas

Un `repeater` identifica un elemento HTML que funciona como plantilla. En modo
Probar y en el sitio exportado, el runtime lo clona una vez por registro:

```json
{
  "pageId": "catalog",
  "elementId": "catalog::main:1/article:1",
  "dataSourceId": "items",
  "itemContext": "item"
}
```

Los descendientes se vinculan usando `item` como dato recibido. Una conexión en
la plantilla puede enviar `$record.id`, que se convierte en el ID de la fila
real que fue pulsada.

## Navegación con contexto

```json
{
  "action": "navigate",
  "targetPage": "detail",
  "context": {
    "selectedRecord": {
      "dataSourceId": "items",
      "recordId": "$record.id"
    }
  }
}
```

En exportaciones estáticas la referencia se conserva como parámetro de URL, por
lo que actualizar, compartir, regresar y avanzar mantienen el registro elegido.

## Vínculos seguros

Un vínculo conecta un campo —incluyendo rutas como `details.title`— con una
propiedad permitida: texto, `src`, `alt`, `href`, `title`, `aria-label` o el
valor de un control de formulario. No se evalúa JavaScript ni HTML procedente
de los registros.
