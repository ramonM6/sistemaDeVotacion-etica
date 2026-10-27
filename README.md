# Sistema de Votación de Electivos — Ingeniería Informática PUCP

Sondeo de demanda de cursos electivos: los alumnos aptos votan por hasta 5 electivos y, en cada uno, por 1 o 2 franjas horarias. El coordinador ve los resultados en vivo (ranking, mapa de calor curso × franja) y los exporta a Excel o PDF. Los alumnos ven los resultados al cierre y pueden modificar o retirar sus elecciones mientras la votación esté abierta. Es un MVP que corre solo en **localhost**.

La especificación completa está en [`docs/ESPECIFICACION.md`](docs/ESPECIFICACION.md) y el plan de estudios en [`docs/PLAN_DE_ESTUDIOS.md`](docs/PLAN_DE_ESTUDIOS.md).

## Inicio rápido en Windows (doble clic)

### Requisitos (solo la primera vez)

1. **Node.js 20 o superior** (versión LTS): <https://nodejs.org>. Al terminar la instalación, cierra y vuelve a abrir cualquier ventana de consola.
2. **Git**: <https://git-scm.com/download/win>, para clonar el repositorio.
3. **Una base PostgreSQL**. Elige una opción:
   - **Opción A (recomendada): Docker Desktop**: <https://www.docker.com/products/docker-desktop>. Ábrelo y espera a que diga *Engine running*. `iniciar.bat` levanta la base solo (`docker compose up -d`).
   - **Opción B: PostgreSQL 16 instalado en Windows.** Crea un usuario y una base, copia `apps\api\.env.example` como `apps\api\.env` y pon tu URL en `DATABASE_URL` (por ejemplo `postgresql://USUARIO:CLAVE@localhost:5432/BASE?schema=public`).

### Clonar y ejecutar

```bat
git clone https://github.com/diego4yala/sistemaDeVotacion-etica.git
cd sistemaDeVotacion-etica
```

Después, haz **doble clic en `iniciar.bat`** (o ejecútalo desde la consola). El script:

1. Verifica que estén instalados Node.js 20+ y npm.
2. Ejecuta `npm install` si faltan dependencias o si `package-lock.json` cambió.
3. Comprueba que PostgreSQL responda en la `DATABASE_URL` configurada. Si no responde y la base es local, la levanta con Docker; si no hay Docker, explica qué instalar.
4. Verifica que los puertos 3000 (API) y 5173 (web) estén libres.
5. Ejecuta `npm run dev`. Este comando crea `apps\api\.env` desde `.env.example` **solo si no existe**, aplica las migraciones, carga los datos de prueba solo si la base está vacía y levanta la API y la web.

Cuando la web está lista se abre el navegador en <http://localhost:5173>. Para detener la aplicación, presiona **Ctrl+C** en la ventana. Si algo falla, la ventana se queda abierta con el mensaje de error.

Las siguientes veces basta con volver a hacer doble clic en `iniciar.bat`: no reinstala ni vuelve a sembrar datos si no hace falta. Si no quieres que se abra el navegador, ejecútalo como `iniciar.bat --sin-navegador`.

> La lógica está en `scripts/iniciar.mjs`, un script de Node, así que en Linux o macOS se usa igual: `node scripts/iniciar.mjs`.

## Cómo levantarlo manualmente

Requisitos: Node 20+, Docker.

```bash
docker compose up -d   # PostgreSQL 16 en localhost:5432
npm install            # instala API y web, y genera el cliente Prisma
npm run dev            # migra, siembra datos la primera vez y levanta API + web
```

- Web: <http://localhost:5173>
- API: <http://localhost:3000/api>

`npm run dev` crea `apps/api/.env` a partir de `.env.example` si no existe, aplica las migraciones y, si la base está vacía, ejecuta el seed.

### Cuentas de prueba

| Rol | Usuario | Contraseña |
|---|---|---|
| Coordinador | `coordinador` | `Coordinador#2026` (variables `COORD_USER` / `COORD_PASSWORD`) |
| Alumnos | ver tabla | `Alumno#2026` |

El seed crea la malla de ejemplo (148 cursos, desde `docs/plantillas/plantilla_catalogo_cursos.xlsx`), un proceso **ABIERTO** "Electivos 2027-1", 16 alumnos sintéticos y 21 votos de ejemplo:

| Código | Caso que cubre |
|---|---|
| 20220101 | Ciclo 5: casi ningún electivo apto |
| 20210202 | Ciclo 6 |
| 20200303 | Ciclo 8 con IA (1INF24) en curso → CONDICIONAL en los electivos de IA |
| 20201234 | (plantilla) 1INF29 con 8; 1INF24 y 1INF39 en curso |
| 20195678 | (plantilla) 1INF24 jalado (9) y luego aprobado (15) |
| 20200404 | 1INF29 con 8 y 1INF35 en curso → 1INF51 CONDICIONAL |
| 20190505 | Curso jalado (1INF24: 7) y luego aprobado (14) |
| 20190606 | Llega a 140 créditos solo con los cursos en curso → DER349 CONDICIONAL |
| 20180707 | Último ciclo: apta para casi todo (1INF41 jalado y en curso) |
| 20190808 | Ya aprobó INF310 y lleva INF356 (etiquetas "Ya aprobaste" / "Lo estás llevando") |
| 20210909 | Curso de otra facultad (TEL618, 0 créditos) y un electivo libre |
| 20201010 | Ciclo 8, línea de seguridad: 1INF39 y 1INF41 en curso |
| 20221111 | Ciclo 3: ningún electivo apto |
| 20201212 | INF238 desaprobado y no lo lleva → `[INF238]` NO_APTO |
| 20181515 | 15 créditos de libre disponibilidad (solo cuentan 12) |
| 20231414 | Sin historial (aparece como aviso en el panel) |

Para volver al estado inicial: `npm run db:reset` (borra **todos** los datos de la base de desarrollo y vuelve a sembrar).

## Tests

```bash
npm test            # unitarios: motor de requisitos (sin base de datos)
npm run test:e2e    # e2e con Supertest contra PostgreSQL
```

Los e2e usan una base aparte, `<base>_test` (por defecto `votacion_test`, en el mismo PostgreSQL de Docker): la crean si no existe, le aplican las migraciones y vacían sus tablas en cada suite. No tocan la base de desarrollo. Cubren los criterios de aceptación: login solo para alumnos del padrón, rate limit, términos obligatorios, 1–2 franjas, máximo 5 cursos, sin duplicados (también con peticiones simultáneas), edición y retiro de votos solo durante la apertura, proceso cerrado, resultados públicos sin datos personales, evento Socket.IO, importaciones con vista previa y que el mapa de calor coincida con el Excel exportado.

## Estructura

```
apps/api      NestJS + Prisma
  src/modules/elegibilidad/motor   motor de requisitos (puro, con tests)
  src/modules/{auth,procesos,votos,resultados,importacion,export,catalogo,padron,audit}
  prisma/schema.prisma · prisma/seed.ts · test/ (e2e)
apps/web      React 18 + Vite + TanStack Query + Tailwind (componentes estilo shadcn/ui) + Recharts
  src/pages/alumno/* · src/pages/coordinador/* · src/lib/api.ts · src/lib/socket.ts
docker-compose.yml
```

El backend sigue Controller → Service → Repository (Prisma). Todas las reglas (elegibilidad, límites, estado del proceso) se validan en el backend; el frontend solo las refleja. El frontend llama a `/api` y `/socket.io` en su mismo origen y Vite los reenvía al API, así la cookie `SameSite=Strict` funciona sin configuración extra.

## Decisiones de implementación

Puntos que la especificación no detalla y cómo se resolvieron:

- **Curso aprobado y vuelto a llevar** (nota ≥ 11 y además una fila vacía): para los requisitos cuenta como aprobado con nota real, y sus créditos se suman una sola vez, como aprobados.
- **Tope de 12 créditos de `ELECTIVO_LIBRE`**: primero se cuentan los aprobados y el saldo se completa con los que están en curso.
- **CONDICIONAL por créditos**: si el requisito de créditos solo se alcanza sumando los cursos en curso, el badge dice "Apto si apruebas tus cursos en curso" (el resultado trae `dependeDeCreditosEnCurso: true`).
- **Padrón y login**: un alumno solo puede iniciar sesión si está en el padrón (Excel de cuentas) del proceso activo, es decir, el abierto o, si no hay ninguno, el último.
- **Malla por votación**: cada nuevo borrador inicia sin cursos. Sube su malla o reutiliza una anterior; no se hereda una oferta global.
- **Reabrir un proceso**: desde `CERRADO` se puede volver a `ABIERTO` solo si la fecha de fin está en el futuro (primero se edita la fecha para extender el plazo).
- **Hoja con otro nombre**: si el Excel no tiene la hoja esperada (`cursos`, `alumnos`, `historial`), se usa la primera hoja que no sea `LEEME` y se muestra una advertencia.
- **Rate limit**: cuenta todos los intentos de login (correctos o no) por IP y código, 5 por minuto.
- **Descripciones**: inclúyelas en la columna opcional `descripcion` de la malla del ciclo.
- **Motor base `SIMULTANEO_PERMISIVO`**: es una constante en `apps/api/src/modules/elegibilidad/motor/constantes.ts` (por defecto `false`, como pide la especificación).

## Requisitos integrados de VotaInf

La actualización y sus reglas vigentes están en [docs/NUEVOS_REQUISITOS.md](docs/NUEVOS_REQUISITOS.md). Conserva el login con código y contraseña, hasta **5 electivos** y **1–2 de las cinco franjas originales**. No utiliza Google ni limita la selección a 28 créditos.

Incluye edición/retiro de elecciones durante la apertura, simultaneidad de electivos con inclusión atómica de dependencias, resultados de alumnos al cierre, tablero de votaciones con gestión de estados de cursos dentro de cada período, filtro por votos confirmados/condicionales y exportación visual a PDF del ranking, mapa de calor e indicadores, reutilización de archivos y mallas por votación e importaciones Excel/CSV con archivos originales en Supabase Storage privado y trazabilidad.

Los resultados y las exportaciones del coordinador muestran agregados. Ya no se publican listas que relacionen alumnos y cursos elegidos. El historial académico del padrón sigue disponible para revisar elegibilidad.

La migración nueva se aplica automáticamente con el inicio habitual (`npm run dev`). No requiere resetear la base. Para una base existente, realiza el respaldo habitual antes de aplicar migraciones.

Pruebas de integración sobre PostgreSQL embebido en memoria, sin Docker ni credenciales:

```bash
npm run test:e2e:local
```

Este comando aplica todas las migraciones en una base efímera y usa `127.0.0.1:54339`. Al terminar elimina la base. Para comprobar el comportamiento específico de PostgreSQL de producción, también se conserva `npm run test:e2e` contra una base cuyo nombre termina en `_test`.


### Archivos originales en Supabase Storage

Configura `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_STORAGE_BUCKET` en `apps/api/.env`. El bucket debe existir y ser privado. La clave se usa exclusivamente en NestJS. La base de datos conserva metadatos (nombre, hash, ruta, tipo y proceso), además de los datos académicos procesados; las nuevas cargas nunca guardan el contenido del archivo en PostgreSQL.

Al crear una votación se pueden adjuntar la malla del ciclo actual, las cuentas y el historial en CSV o Excel `.xlsx` (máximo 5 MB cada uno). El borrador abre «Datos y archivos» para revisar y confirmar, en este orden: malla, cuentas, historial. La malla utiliza la hoja `cursos` y las columnas de la plantilla de malla; se conserva una copia para la votación. Las cuentas usan `alumnos` y el historial `historial`. En CSV se leen los mismos encabezados sin hojas.

Para una instalación previa, aplica las migraciones y migra los originales antiguos:

```sh
npm exec -w apps/api -- prisma migrate deploy
cd apps/api
npx tsx scripts/migrar-archivos-storage.ts
```

El migrador sube cada original y solo entonces vacía su contenido antiguo. Conserva `ARCHIVOS_SECRET` (o el `JWT_SECRET` original) hasta terminar. La columna antigua es temporal y nullable para migrar sin perder archivos; ninguna carga nueva la utiliza. Las descargas siguen pasando por la API y requieren rol de coordinador.

Referencias: [buckets privados](https://supabase.com/docs/guides/storage/buckets/fundamentals), [descargas autenticadas](https://supabase.com/docs/guides/storage/serving/downloads).


Al crear una votación, cada sección ofrece **Subir archivo nuevo** o **Reutilizar malla/cuentas/historial**. Elige una votación anterior con datos cargados para cada tipo. Se copian sus datos al borrador; si existe un original en Supabase se reutiliza su referencia privada sin duplicar el archivo. Las cuentas mantienen sus credenciales. No se copian votos, aceptaciones de términos ni decisiones. Para reutilizar historial se necesita un padrón compatible: reutiliza sus cuentas al crear, o sube primero las cuentas nuevas y después importa el historial. Las votaciones de ejemplo pueden tener datos pero carecer del archivo original.
