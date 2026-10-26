# Reglas vigentes tras integrar VotaInf

## Decisiones conservadas

- NestJS, Prisma/PostgreSQL y React/Vite del proyecto base.
- Login por código y contraseña, con roles Alumno y Coordinador; sin Google.
- Máximo de 5 electivos por alumno. No existe límite de 28 créditos.
- Cada curso exige 1 o 2 franjas distintas: mañana, media mañana, mediodía, tarde y noche. Se mantienen sus horarios originales.
- Un curso aporta un voto, aunque tenga dos franjas. No hay orden de preferencia ni votos ponderados.

## Elecciones y elegibilidad

El alumno puede editar las franjas o retirar sus elecciones desde **Mis votos** mientras el proceso esté abierto y dentro de sus fechas. Para sustituir un curso, retira su elección y elige otro. Al cerrar, las mutaciones se rechazan también desde la API.

Se conservan las notaciones y notas mínimas del motor del proyecto base. No se permite elegir un curso ya aprobado o actualmente en curso. Los créditos mínimos de los requisitos continúan siendo requisitos de elegibilidad; no limitan los créditos de la selección.

Si falta un requisito simultáneo electivo, se añade junto con sus dependencias en la misma transacción, se valida su elegibilidad y todos cuentan dentro del máximo de 5. Las nuevas dependencias reciben las franjas del curso inicial; luego se pueden editar por separado. Si el paquete no cabe, no se guarda ningún voto. Retirar un requisito elimina también los electivos que dependen de él. Para simultaneidad obligatoria se muestra el compromiso de matricularse en el curso.

Los términos pasan a versión 2 para reflejar las elecciones editables y la privacidad.

## Procesos y catálogo

Se distinguen ciclo actual y objetivo. El ciclo actual es opcional para compatibilidad con procesos existentes. Al abrir por primera vez se guarda el catálogo completo y se fija el padrón y el historial académico. Una carga posterior del catálogo global sirve para próximos procesos; no modifica la elegibilidad del proceso ya abierto. Se conservan los cursos referenciados por catálogos congelados, aunque no tengan votos.

En **Procesos**, el selector **Reutilizar catálogo de…** copia el catálogo de otro proceso a un borrador antes de abrirlo. Sin copia explícita, la primera apertura usa el catálogo global vigente. Una copia reutilizada prevalece sobre posteriores cambios al catálogo global.

El cierre automático existente continúa funcionando. Se puede extender y reabrir un proceso sin seguimiento del consejo: los votos permanecen y los resultados de alumnos vuelven a ocultarse. Con seguimiento registrado, la reapertura se bloquea, como en VotaInf.

## Resultados y consejo

Los alumnos ven ranking, franjas y decisiones de dictado solo al cierre. Se actualizan cada 30 segundos, al recuperar el foco y por los eventos de proceso/votación.

El coordinador tiene filtros por ingreso, CRAEst mínimo/máximo y matrícula. Las cuentas admiten columnas opcionales `ingreso` (AAAA o AAAA.1/AAAA.2), `craest` (0–100) y `matriculado` (si/no). Los datos ausentes permanecen sin clasificar: no se infieren del código del alumno. Los no matriculados pueden participar si pertenecen al padrón.

Las agrupaciones muestran votos por curso e ingreso, tramo CRAEst o matrícula, con participantes y población habilitada del grupo. Los filtros se aplican a indicadores, ranking, agrupaciones y PDF. El Excel general conserva la exportación agregada completa del proceso.

**Consejo** permite seleccionar manualmente cursos para revisión, registrar Aprobado/No aprobado y decidir Confirmado/No se dictará después del cierre. Solo un curso seleccionado puede recibir una decisión del consejo y solo uno aprobado puede confirmarse. No se registran docentes ni se seleccionan cursos automáticamente por cantidad de votos.

El CSV del consejo tiene exactamente las columnas `codigo,consejo,dictado,observacion`. Los estados válidos son `PENDIENTE`, `APROBADO`/`NO_APROBADO` para consejo y `PENDIENTE`, `CONFIRMADO`/`NO_SE_DICTARA` para dictado. Primero se valida y previsualiza; después se confirma. Los cursos deben estar previamente seleccionados para revisión. Si alguna fila es inválida, no se aplica ninguna.

El PDF permite incluir o excluir tabla, gráficos, estadísticas y agrupaciones y usa los filtros activos. No incluye nombres de alumnos. Los Excel generales y de curso también son agregados. El detalle académico del padrón no revela qué cursos eligió un alumno.

## Importaciones y archivos

Continúan las plantillas Excel y se admiten CSV con las mismas columnas. Las importaciones mantienen su vista previa y token de confirmación de un solo uso. El máximo de archivo es 5 MB y 20000 filas para los datos académicos; para CSV del consejo son 2 MB y 15000 filas.

La confirmación guarda el original cifrado con AES-256-GCM dentro de la misma transacción que aplica los datos. Se registra nombre, tipo, proceso, actor, filas, fecha y SHA-256. La descarga exige rol Coordinador. Se guarda en PostgreSQL porque este proyecto funciona en localhost y no necesita Supabase Storage.

Configura una clave estable `ARCHIVOS_SECRET`; si falta, se deriva de `JWT_SECRET`. Cambiar la clave utilizada impide descifrar archivos antiguos: debe conservarse con el respaldo de la base. Los listados nunca devuelven el contenido cifrado ni contraseñas. Las importaciones anteriores a esta actualización no tienen archivo original recuperable.

## Migración y verificación

La migración `20261026190000_nuevos_requisitos` agrega los datos de perfil, primera apertura, ciclo actual, catálogo congelado, seguimiento y archivos. Conserva las tablas y votos existentes. Los procesos abiertos o cerrados existentes reciben su catálogo actual como copia inicial; no es posible recuperar versiones históricas que antes no se almacenaban. Los límites configurados superiores a 5 cursos o 2 franjas se reducen a esos topes; no se eliminan votos históricos.

Comandos: `npm run lint`, `npm test`, `npm run build` y `npm run test:e2e:local`. La integración local ejecuta todas las migraciones y los endpoints NestJS reales contra PGlite temporal. Para validar además las diferencias de concurrencia/protocolo respecto de PostgreSQL completo, utiliza `npm run test:e2e` con una base `_test` independiente. No se ejecutan escrituras de prueba sobre la base de desarrollo ni servicios externos.
