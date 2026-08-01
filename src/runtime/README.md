# Generated runtime

Este directorio alojará código pequeño e independiente que se insertará en los
sitios exportados. El runtime no puede importar React, GrapesJS ni componentes
del editor.

`navigation-runtime.ts` contiene el runtime de navegación del Hito 3. El mismo
código funciona con dos transportes: mensajes hacia el editor durante las
pruebas y navegación real mediante `location` dentro del ZIP exportado.
