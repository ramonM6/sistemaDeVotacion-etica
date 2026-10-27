# Reglas vigentes del sistema

## Cuentas y votaciones

El login usa código y contraseña. El coordinador crea votaciones por período, prepara archivos y publica abriendo la votación. El coordinador importa las cuentas globales en Alumnos. Toda cuenta registrada puede iniciar sesión, incluso sin votaciones. Solo se muestran votaciones publicadas en cuyo historial académico aparece el alumno; el padrón se genera automáticamente a partir de ese historial. Las credenciales de los alumnos se mantienen entre períodos. No hay aceptación de términos ni favoritos/interesados.

Una votación pasa de borrador a abierta y luego a cerrada. El cierre también ocurre al llegar la fecha final. Puede reabrirse extendiendo el plazo si no existen decisiones posteriores del consejo. Cada votación conserva su malla; no se ofrece un catálogo global en la interfaz.

## Archivos por votación

Las cuentas globales, la malla curricular y el historial se cargan en CSV UTF-8 o Excel `.xlsx`, hasta 5 MB por archivo. Se validan encabezados, tipos de datos y referencias. Alumnos permite importar cuentas nuevas o actualizar las del mismo código sin eliminar las omitidas ni cambiar padrones. En cada votación solo se cargan malla e historial; al reemplazar o eliminar el historial se regenera o vacía su padrón. El historial rechaza códigos sin cuenta registrada. Las cuentas pueden importarse aunque haya votaciones abiertas.

Se pueden reutilizar malla e historial de una votación anterior al crear otra, sin volver a cargar cuentas. No se copian votos ni decisiones. Supabase Storage guarda los originales en un bucket privado; PostgreSQL conserva los registros procesados y las referencias. Las descargas requieren coordinación. Las plantillas Excel y los CSV de ejemplo también se descargan exclusivamente desde Supabase Storage; no hay alternativa local en la API. Desde la primera apertura se bloquean los cambios de datos académicos y malla.

## Requisitos y voto

Se permiten hasta 5 electivos y de 1 a 2 franjas por voto: mañana, media mañana, mediodía, tarde y noche. Los créditos no sustituyen el límite de cursos.

- **Apto:** cumple los requisitos.
- **Condicional:** hay requisitos académicos en progreso, créditos que se alcanzarían aprobando cursos actuales o requisitos que se llevarán en simultáneo. El voto cuenta desde su registro.
- **No apto:** falta algún requisito que no puede cubrirse con esos supuestos, o el alumno ya aprobó/lleva el propio electivo.

El tooltip detalla requisitos pendientes y cantidades de créditos. Una nota vacía en el historial indica un curso en progreso. Para cursos repetidos se usa la mejor nota; los aprobados suman créditos una sola vez. Los electivos libres cuentan hasta 12 créditos. El plan de referencia está en [PLAN_DE_ESTUDIOS.md](PLAN_DE_ESTUDIOS.md).

El alumno vota individualmente desde el detalle o por cursos marcados desde la tabla. Las dependencias electivas simultáneas se incluyen atómicamente dentro del límite de 5. Puede editar franjas en un modal o retirar votos mientras la votación esté abierta. Retirar un requisito simultáneo retira las elecciones que dependen de él. Los controles de padrón, apertura, aptitud y límites se validan en la API.

## Resultados y decisiones

Alumnos y coordinador ven resultados agregados en vivo. Los eventos de Socket.IO vuelven a consultar los datos; al reconectarse se actualizan y existe consulta periódica de respaldo. No se publican identidades asociadas a elecciones. Coordinación exporta los gráficos e indicadores según el filtro de votos confirmado/condicional elegido.

Después del cierre, coordinación decide por etapas:

1. **Selección de cursos:** pendiente, seleccionado para revisión o no seleccionado.
2. **Resultados del consejo:** solo cursos seleccionados; aprobado o no aprobado.
3. **Decisión de dictado:** solo cursos aprobados; pendiente, confirmado o no se dictará según disponibilidad docente.

Las casillas comienzan vacías. Se puede aplicar una decisión a varios cursos marcados y dejar el resto como no seleccionado/no aprobado/no se dictará. En selección, el menú de fila permite consultar detalle y cambiar el estado; su submenú abre hacia la izquierda. Cambiar una decisión anterior reinicia las posteriores afectadas, con confirmación. El alumno consulta las etapas en modo lectura. Todas las confirmaciones se muestran en modales del sistema.
