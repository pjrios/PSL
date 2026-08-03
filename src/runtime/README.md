# Generated runtime

Este directorio alojará código pequeño e independiente que se insertará en los
sitios exportados. El runtime no puede importar React, GrapesJS ni componentes
del editor.

`navigation-runtime.ts` contiene el runtime de navegación y datos. El mismo
código funciona con dos transportes: mensajes hacia el editor durante las
pruebas y navegación real mediante `location` dentro del ZIP exportado. También
resuelve registros estáticos o REST, repite plantillas, aplica vínculos seguros
y conserva referencias de registro en la URL. Cuando el manifiesto habilita
Supabase Auth, también renueva la sesión, protege páginas y devuelve al usuario
a la página que solicitó después de iniciar sesión.
