> **Actualización:** las reglas modificadas al integrar VotaInf están en [NUEVOS_REQUISITOS.md](NUEVOS_REQUISITOS.md) y prevalecen sobre las secciones históricas de este documento. En particular, los votos ahora se pueden editar/retirar durante la apertura, los resultados de alumnos se muestran al cierre y los reportes del coordinador no incluyen elecciones individuales identificadas.

# Sistema de Votación de Cursos Electivos — Ingeniería Informática PUCP

> Especificación para implementar con Claude Code. MVP para una práctica de desarrollo de software. Corre solo en **localhost**, sin integraciones externas.
> Archivos que acompañan este documento: `PLAN_DE_ESTUDIOS.md` (plan completo, ciclos 1–10, legible), `plantilla_catalogo_cursos.xlsx` (los mismos datos en el formato que importa el sistema), `plantilla_cuentas_alumnos.xlsx`, `plantilla_historial_academico.xlsx`.

---

## 1. Contexto y objetivo

Hoy los alumnos piden la apertura de electivos por el Discord de la facultad: los pedidos se dispersan y se pierden, y el coordinador académico no sabe con exactitud qué electivos tienen más demanda.

El sistema es un **sondeo de demanda**, no una matrícula:

- Los alumnos aptos votan por hasta **5 electivos** y, para cada uno, por **1 o 2 franjas horarias** preferidas.
- El coordinador ve los resultados en un dashboard y los usa como **insumo**. Que un curso sea muy votado **no obliga** a abrirlo: el coordinador aún coordina con el consejo de facultad la disponibilidad de profesores y horarios.
- La votación ocurre aproximadamente en la **semana 9** (después de parciales) para el ciclo siguiente.

## 2. Alcance del MVP

**Incluye:** dos roles (Coordinador y Alumno), carga de datos por Excel, motor de requisitos, votación de curso + franja, términos, resultados en vivo para ambos roles, dashboard con mapa de calor, exportación a Excel.

**No incluye (fuera de alcance):** login PUCP/SSO, notificaciones por correo, despliegue, concentraciones, registro de la decisión final del coordinador, laboratorios/prácticas/exámenes, electivos de libre disponibilidad o de otras facultades, múltiples coordinadores.

## 3. Stack y arquitectura

| Capa | Tecnología | Motivo |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript, React Router, TanStack Query, Tailwind CSS + shadcn/ui, Recharts | SPA tipada, componentes accesibles, gráficos simples |
| Backend | NestJS (Node 20 + TypeScript) | Módulos, guards de roles, DTOs validados, gateway WebSocket integrado |
| Base de datos | PostgreSQL 16 (Docker Compose) + Prisma ORM | Relacional, migraciones, consultas parametrizadas |
| Tiempo real | Socket.IO (gateway de NestJS) | Resultados en vivo en localhost |
| Excel | `exceljs` (lectura e importación, y exportación) | |
| Validación | `class-validator` en backend, `zod` en formularios | |
| Tests | Jest (unitarios del motor de requisitos y servicios), Supertest (e2e de votación) | |

**Estructura (monorepo):**

```
/apps/api        NestJS
  src/modules/auth, usuarios, catalogo, padron, procesos, elegibilidad, votos, resultados, importacion, export
  prisma/schema.prisma, prisma/seed.ts
/apps/web        React
  src/pages/alumno/*, src/pages/coordinador/*, src/components/*, src/lib/api.ts, src/lib/socket.ts
/docker-compose.yml   (postgres)
/README.md            cómo levantar todo con 3 comandos
```

Arquitectura en capas en el backend: **Controller → Service → Repository (Prisma)**. Toda regla de negocio (elegibilidad, límites de votos, estado del proceso) vive en servicios del backend; el frontend solo refleja.

## 4. Roles

- **COORDINADOR:** una sola cuenta, creada por el seed con credenciales de variables de entorno (`COORD_USER`, `COORD_PASSWORD`).
- **ALUMNO:** cuentas creadas al importar el Excel de cuentas. Solo pueden entrar los alumnos que el coordinador subió.

## 5. Datos de entrada (Excel)

Las tres plantillas incluyen una hoja `LEEME` con las instrucciones. El sistema debe validar cada archivo, mostrar una **vista previa con errores y advertencias por fila**, y solo guardar cuando el coordinador confirma. Una importación reemplaza los datos anteriores de ese tipo para el proceso.

### 5.1 Catálogo de cursos — hoja `cursos`

| Columna | Tipo | Regla |
|---|---|---|
| codigo | texto | obligatorio, único (ej. `1INF24`) |
| nombre | texto | obligatorio |
| creditos | decimal ≥ 0 | obligatorio |
| tipo | `OBLIGATORIO` \| `ELECTIVO` \| `ELECTIVO_GENERALES` \| `ELECTIVO_LIBRE` | obligatorio |
| ciclo | entero 1–10 | opcional |
| grupo | `EH1` \| `EH2` \| `TEO` | opcional; solo para electivos de Estudios Generales |
| requisitos | texto en notación PUCP | opcional |
| descripcion | texto | opcional; editable luego en el sistema |

- Contiene **todos** los cursos del plan (148) porque se necesitan sus créditos para calcular "créditos aprobados". La plantilla ya viene completa: Estudios Generales Ciencias (ciclos 1–4) y Facultad (ciclos 5–10, plan 2026-2). El detalle legible está en `PLAN_DE_ESTUDIOS.md`.
- **Solo los cursos `ELECTIVO` (54) salen a votación.** `ELECTIVO_GENERALES` (humanidades y teología) y `ELECTIVO_LIBRE` (libre disponibilidad) solo suman créditos.
- Solo se parsean y evalúan los requisitos de los cursos `ELECTIVO`; los demás se guardan como texto informativo.
- Al reimportar, **no borrar** la `descripcion` ya editada en el sistema si la celda viene vacía.

### 5.2 Cuentas de alumnos — hoja `alumnos`

`codigo` (8 dígitos, único, usuario de login) · `nombres` · `apellidos` · `correo` (opcional) · `password` (mín. 8 caracteres).

La contraseña se guarda **hasheada con bcrypt** al importar (cuesta cero implementarlo; el Excel no se persiste).

### 5.3 Historial académico — hoja `historial`

`codigo_alumno` · `codigo_curso` · `nota`

- `nota` es un entero de 0 a 20. **Vacía = el alumno está llevando el curso este ciclo ("en curso").**
- Si un curso aparece varias veces para el mismo alumno, se toma la **nota máxima**. Si alguna de esas filas está vacía, el curso cuenta como **en curso**.
- Validaciones: el alumno debe existir en cuentas (si no, error). Si el curso no está en el catálogo, se muestra una advertencia y se guarda igual (puede ser requisito), pero aporta **0 créditos**.

## 6. Motor de requisitos (núcleo del sistema)

### 6.1 Parser

Entrada: el texto de la columna `requisitos`. Se separa por comas y cada término es uno de estos:

| Notación | Tipo interno | Se cumple si… |
|---|---|---|
| `1INF24` | `APROBADO` | nota máxima ≥ 11, **o** en curso |
| `(1INF29)` | `CURSADO_NOTA_MIN_8` | nota máxima ≥ 8, **o** en curso |
| `[1INF39]` | `APROBADO_O_SIMULTANEO` | nota máxima ≥ 11, **o** en curso |
| `{INF238}` | `CURSADO_O_SIMULTANEO` | existe cualquier nota (aunque sea desaprobatoria), **o** en curso |
| `N créditos aprobados *` | `CREDITOS_MIN` | créditos aprobados + créditos en curso ≥ N |

- Todos los términos se combinan con **AND**.
- Regex sugerida: `^\((\w+)\)$`, `^\[(\w+)\]$`, `^\{(\w+)\}$`, `^(\d+)\s*cr[eé]ditos aprobados\s*\*?$`, `^[0-9A-Z]{6}$`.
- Un término que no se reconoce genera un **error en la vista previa** de la importación; el coordinador puede corregirlo editando el curso.
- **Créditos aprobados** = suma de créditos de los cursos **del catálogo** con nota máxima ≥ 11. **Créditos en curso** = suma de créditos de los cursos del catálogo en curso.
- Los créditos de `ELECTIVO_LIBRE` cuentan como máximo **12** en total (aprobados + en curso), según la nota (**) del plan. Cursos que no están en el catálogo (otras facultades) aportan 0.

> **Decisión sobre `[X]` y `{X}`:** "cursar simultáneamente" se refiere a llevar X el próximo ciclo junto con el electivo, y eso el sistema no lo puede saber. En el MVP se evalúan igual que si X debiera estar aprobado o en curso. Dejarlo en una constante configurable (`SIMULTANEO_PERMISIVO = false`) por si luego se decide aceptarlo siempre.

### 6.2 Resultado por alumno y electivo

```ts
type Aptitud = 'CONFIRMADO' | 'CONDICIONAL' | 'NO_APTO';
interface EvaluacionRequisito { termino: string; cumple: boolean; dependeDeEnCurso: boolean; detalle: string }
interface ResultadoElegibilidad { aptitud: Aptitud; requisitos: EvaluacionRequisito[]; cursosEnCursoNecesarios: string[] }
```

- **CONFIRMADO:** cumple todos los requisitos solo con notas reales.
- **CONDICIONAL:** cumple todos, pero al menos uno depende de un curso en curso (o de créditos en curso). Se lista cuáles.
- **NO_APTO:** algún requisito no se cumple ni asumiendo que aprueba lo que está llevando.
- Un electivo **sin requisitos** es CONFIRMADO.
- Un alumno **sí puede votar** por un electivo que ya aprobó o que está llevando (decisión del usuario). La UI muestra una etiqueta informativa: "Ya aprobaste este curso" o "Lo estás llevando".
- La elegibilidad se calcula al vuelo en el backend y la aptitud se **guarda como snapshot en el voto** al momento de votar.

### 6.3 Tests obligatorios (Jest)

Cubrir al menos estos casos:

- Cada tipo de término con nota 7, 8, 10, 11 y vacía.
- Curso repetido (9 y luego 15 → aprobado).
- Requisito compuesto (`1INF24, 1INF41`).
- Créditos justo en el límite.
- Créditos que solo alcanzan sumando los cursos en curso (→ CONDICIONAL).
- Electivo sin requisitos.
- Término mal escrito (→ error de parseo).

## 7. Reglas de votación

1. Solo existe **un proceso de votación abierto** a la vez. Estados: `BORRADOR → ABIERTO → CERRADO`. El coordinador lo abre y lo cierra manualmente, y además se cierra solo al pasar `fechaFin`. Desde `CERRADO` puede volver a `ABIERTO` (para extender el plazo).
2. Antes de votar por primera vez en un proceso, el alumno debe **aceptar los términos** (sección 8). Se registra la fecha y hora y la versión del texto.
3. Un alumno puede votar por **hasta 5 electivos distintos** (`maxCursos`, configurable por proceso, por defecto 5). No está obligado a usar los 5.
4. Cada voto exige **al menos 1 y como máximo 2 franjas** distintas (`maxFranjas`, por defecto 2). Curso y franja se envían en **una sola operación atómica**: no existe un voto sin franja.
5. **Los votos son definitivos:** no se editan ni se retiran. Antes de confirmar se muestra un modal de advertencia.
6. Solo se puede votar por electivos con aptitud `CONFIRMADO` o `CONDICIONAL`.
7. El backend revalida todo en una transacción: proceso abierto, términos aceptados, aptitud, menos de 5 votos, franjas válidas y no duplicadas. Hay un índice único en `(procesoId, alumnoId, cursoCodigo)` para evitar condiciones de carrera.
8. Tras cada voto se emite un evento Socket.IO `resultados:actualizados` para refrescar los dashboards.

### Franjas horarias (enum fijo)

| Enum | Etiqueta | Horario |
|---|---|---|
| MANANA | Mañana | 08:00 – 10:00 |
| MEDIA_MANANA | Media mañana | 10:00 – 13:00 |
| MEDIODIA | Mediodía | 13:00 – 16:00 |
| TARDE | Tarde | 16:00 – 19:00 |
| NOCHE | Noche | 19:00 – 22:00 |

La franja aplica a todas las sesiones semanales del curso. El conteo por franja suma 1 por cada franja marcada, así que un voto con 2 franjas aporta 1 a cada una.

## 8. Términos de participación (texto inicial, versión 1)

> Al participar en esta votación declaro que:
> 1. Mis votos reflejan un interés real en llevar los cursos seleccionados el próximo ciclo.
> 2. Si algún curso que estoy llevando es requisito de un electivo por el que voto, asumo el compromiso de aprobarlo para poder matricularme.
> 3. Entiendo que esta votación es referencial: los resultados orientan a la coordinación, pero no garantizan la apertura de ningún curso ni de ningún horario.
> 4. Entiendo que mis votos son definitivos y quedan registrados con mi código de alumno, y que solo la coordinación puede ver quién votó por cada curso.

## 9. Modelo de datos (Prisma, orientativo)

```prisma
enum Rol { ALUMNO COORDINADOR }
enum TipoCurso { OBLIGATORIO ELECTIVO ELECTIVO_GENERALES ELECTIVO_LIBRE }
enum TipoRequisito { APROBADO CURSADO_NOTA_MIN_8 APROBADO_O_SIMULTANEO CURSADO_O_SIMULTANEO CREDITOS_MIN }
enum EstadoProceso { BORRADOR ABIERTO CERRADO }
enum Aptitud { CONFIRMADO CONDICIONAL NO_APTO }
enum Franja { MANANA MEDIA_MANANA MEDIODIA TARDE NOCHE }

model Usuario {
  id           String   @id @default(uuid())
  codigo       String   @unique
  nombres      String
  apellidos    String
  correo       String?
  passwordHash String
  rol          Rol
  createdAt    DateTime @default(now())
}

model Curso {
  codigo          String      @id
  nombre          String
  creditos        Decimal     @db.Decimal(4,2)
  tipo            TipoCurso
  ciclo           Int?
  grupo           String?     // EH1, EH2, TEO
  requisitosTexto String?
  descripcion     String?
  requisitos      Requisito[]
}

model Requisito {
  id                String        @id @default(uuid())
  cursoCodigo       String
  tipo              TipoRequisito
  cursoRequerido    String?       // código, puede no existir en Curso
  creditosMinimos   Int?
  curso             Curso         @relation(fields: [cursoCodigo], references: [codigo], onDelete: Cascade)
}

model ProcesoVotacion {
  id            String        @id @default(uuid())
  nombre        String        // ej. "Electivos 2027-1"
  cicloObjetivo String        // ej. "2027-1"
  fechaInicio   DateTime
  fechaFin      DateTime
  maxCursos     Int           @default(5)
  maxFranjas    Int           @default(2)
  estado        EstadoProceso @default(BORRADOR)
}

model PadronAlumno {                // alumno habilitado en un proceso
  procesoId String
  usuarioId String
  @@id([procesoId, usuarioId])
}

model HistorialItem {
  id          String @id @default(uuid())
  procesoId   String
  usuarioId   String
  cursoCodigo String   // sin FK: puede no estar en el catálogo
  nota        Int?     // null = en curso
  @@index([procesoId, usuarioId])
}

model AceptacionTerminos {
  procesoId String
  usuarioId String
  version   Int
  aceptadoEn DateTime @default(now())
  @@id([procesoId, usuarioId])
}

model Voto {
  id          String      @id @default(uuid())
  procesoId   String
  usuarioId   String
  cursoCodigo String
  aptitud     Aptitud     // snapshot
  createdAt   DateTime    @default(now())
  franjas     VotoFranja[]
  @@unique([procesoId, usuarioId, cursoCodigo])
}

model VotoFranja {
  votoId String
  franja Franja
  voto   Voto @relation(fields: [votoId], references: [id], onDelete: Cascade)
  @@id([votoId, franja])
}

model AuditLog {
  id        String   @id @default(uuid())
  usuarioId String?
  accion    String   // LOGIN_OK, LOGIN_FAIL, IMPORT_CATALOGO, VOTO, CAMBIO_ESTADO_PROCESO...
  detalle   Json?
  createdAt DateTime @default(now())
}
```

El catálogo es **global**: las descripciones persisten entre procesos. El padrón y el historial son **por proceso**, porque cada ciclo cambian.

## 10. API REST (prefijo `/api`)

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| POST | /auth/login | público | `{codigo, password}` → cookie httpOnly con JWT |
| POST | /auth/logout | autenticado | |
| GET | /auth/me | autenticado | usuario y rol |
| GET | /procesos/activo | autenticado | proceso abierto (o el último) |
| GET | /alumno/estado | ALUMNO | términos aceptados, votos usados y máximo |
| POST | /alumno/terminos | ALUMNO | acepta los términos |
| GET | /alumno/electivos | ALUMNO | todos los electivos con su `ResultadoElegibilidad` y si ya votó |
| GET | /alumno/electivos/:codigo | ALUMNO | detalle |
| POST | /alumno/votos | ALUMNO | `{cursoCodigo, franjas: Franja[]}` |
| GET | /alumno/votos | ALUMNO | mis votos |
| GET | /resultados/publicos | ALUMNO, COORD | ranking y franjas **sin nombres** |
| GET | /coord/procesos · POST · PATCH /:id · PATCH /:id/estado | COORD | CRUD de procesos |
| POST | /coord/import/:tipo/preview | COORD | `tipo` = catalogo \| cuentas \| historial; devuelve filas, errores y advertencias |
| POST | /coord/import/:tipo/confirmar | COORD | aplica la importación (token de la vista previa) |
| GET | /coord/cursos · PATCH /coord/cursos/:codigo | COORD | editar nombre, créditos, descripción y requisitos |
| GET | /coord/padron · GET /coord/padron/:codigo | COORD | alumnos y detalle (historial, créditos, aptitud por electivo) |
| GET | /coord/resultados | COORD | indicadores, ranking, matriz curso × franja |
| GET | /coord/resultados/:codigo | COORD | detalle con lista de votantes |
| GET | /coord/export/resultados.xlsx | COORD | hojas: Ranking, Matriz franjas, Votos detallados |

WebSocket: namespace `/resultados`, evento `resultados:actualizados` (sin datos personales; el cliente vuelve a pedir los datos con TanStack Query).

## 11. Pantallas

### Alumno

1. **Login:** código y contraseña. Mensaje de error genérico.
2. **Inicio:** estado del proceso (abierto/cerrado, cuenta regresiva al cierre), contador "Votos usados: 2 de 5", accesos a Catálogo, Mis votos y Resultados. Si no hay proceso abierto, solo lectura.
3. **Modal de términos:** bloqueante en la primera entrada a un proceso abierto, con checkbox y botón "Acepto".
4. **Catálogo de electivos:** todos los electivos en tarjetas con código, nombre, créditos, descripción corta y badge de aptitud:
   - CONFIRMADO: verde, "Apto".
   - CONDICIONAL: ámbar, "Apto si apruebas 1INF24".
   - NO_APTO: tarjeta **en gris**, botón deshabilitado y tooltip con lo que falta.
   - Ya votado: badge "Votado" con sus franjas.
   - Incluye buscador por código o nombre y filtros (Todos / Aptos / Votados). Con 5 votos usados, todos los botones de votar se deshabilitan.
5. **Detalle y votación:** descripción completa y checklist de requisitos (✓, ✗ o "en curso"). Selector de franjas como chips con la etiqueta y el horario (mínimo 1, máximo 2). Botón "Votar", que abre un **modal de confirmación**: "Tu voto es definitivo y no podrás modificarlo ni retirarlo".
6. **Mis votos:** tabla de solo lectura con curso, franjas, aptitud al votar y fecha.
7. **Resultados (en vivo):** ranking de electivos por número de votos (barras horizontales) y, al seleccionar un curso, la distribución por franja. **Nunca** muestra quién votó.

### Coordinador

1. **Login.**
2. **Panel:** proceso activo, indicadores (alumnos habilitados, alumnos que votaron, participación %, total de votos) y avisos (por ejemplo, "12 electivos sin descripción" o "No se ha cargado historial").
3. **Procesos:** lista y formulario (nombre, ciclo objetivo, fechas, máximo de cursos, máximo de franjas). Botones Abrir y Cerrar.
4. **Carga de datos:** tres tarjetas (Catálogo, Cuentas, Historial). Cada una con subida de archivo, botón para descargar la plantilla, tabla de vista previa con filas en rojo (errores) y ámbar (advertencias), resumen ("140 filas válidas, 2 errores") y botón Confirmar, deshabilitado si hay errores.
5. **Catálogo:** tabla de cursos con filtro por tipo e indicador "falta descripción" (solo relevante para los `ELECTIVO`). Al editar un curso se puede cambiar la descripción, los créditos y los requisitos (el texto se re-parsea al guardar).
6. **Padrón:** tabla de alumnos con código, nombre, créditos aprobados, créditos en curso y número de votos. El detalle de un alumno muestra su historial y su aptitud por electivo (útil para verificar el motor).
7. **Dashboard de resultados (en vivo):**
   - Ranking en barras apiladas: votos CONFIRMADOS y CONDICIONALES por curso.
   - **Mapa de calor:** filas = electivos con al menos un voto (ordenados por total), columnas = 5 franjas; la intensidad de cada celda es la cantidad de votos y se muestra el número.
   - Filtro por aptitud (todos / solo confirmados).
   - Botón "Exportar Excel".
8. **Detalle de curso:** distribución por franja, conteo confirmados/condicionales y tabla de votantes (código, nombre, aptitud, franjas, fecha), exportable.

## 12. Seguridad (dentro de lo razonable para un MVP local)

- Contraseñas con bcrypt (cost 10). Login con rate limit (`@nestjs/throttler`, 5 intentos por minuto por IP y código) y mensaje de error genérico.
- JWT en cookie `httpOnly`, `SameSite=Strict`, expiración de 8 horas.
- Guards de rol en cada endpoint y verificación de pertenencia: el alumno solo accede a sus propios datos.
- Validación de todos los DTO (whitelist con `forbidNonWhitelisted`).
- Subida de archivos: solo `.xlsx`, máximo 5 MB, procesamiento en memoria, nunca se ejecutan fórmulas.
- `helmet`, CORS restringido a `http://localhost:5173`.
- Prisma (consultas parametrizadas). Las respuestas para alumnos nunca incluyen datos de otros alumnos.
- AuditLog de login, importaciones, cambios de estado del proceso y votos.
- Secretos en `.env` (incluir `.env.example`).

## 13. Datos de prueba (seed)

`prisma/seed.ts` debe crear:

- El coordinador.
- El catálogo completo, importado desde `plantilla_catalogo_cursos.xlsx`.
- Un proceso `ABIERTO`.
- Unos **15 alumnos sintéticos** que cubran todos los casos del motor:
  - Ciclo 5 con casi ningún electivo apto.
  - Ciclo 8 con IA en curso (→ CONDICIONAL en los electivos de IA).
  - Un alumno con 1INF29 en 8 (cumple `(1INF29)`).
  - Un alumno con un curso jalado y luego aprobado.
  - Un alumno que llega a 140 créditos solo con los cursos en curso.
  - Un alumno de último ciclo apto para casi todo.
  - Los historiales deben incluir los cursos de ciclos 1–4 (con un electivo de cada grupo EH1, EH2 y TEO) para que los créditos sean realistas.
- Algunos votos ya emitidos, para que el dashboard no esté vacío.

## 14. Criterios de aceptación

- [ ] El coordinador importa las tres plantillas; los errores se muestran por fila y no se guarda nada hasta confirmar.
- [ ] Un alumno que no está en el Excel de cuentas no puede iniciar sesión.
- [ ] El alumno ve **todos** los electivos y los no aptos aparecen en gris con el motivo.
- [ ] No puede votar sin aceptar los términos, sin elegir franja, con más de 2 franjas, por más de 5 cursos ni dos veces por el mismo curso, aunque la petición se haga directamente a la API.
- [ ] Los votos no se pueden editar ni eliminar.
- [ ] El dashboard del coordinador y la pantalla de resultados del alumno se actualizan sin recargar al llegar un voto.
- [ ] El mapa de calor curso × franja coincide con los conteos de la exportación a Excel.
- [ ] Los tests del motor de requisitos pasan.
- [ ] Todo se levanta en localhost con `docker compose up -d`, `npm install` y `npm run dev`.

## 15. Trabajo futuro (no implementar ahora)

- **Concentraciones relevantes para Informática**, según los PDF de la facultad. Se podrían mostrar como etiqueta informativa en cada electivo.
  - *Inteligencia Artificial* (profundidad, para Informática): 1INF24 como base y luego 1INF02, 1INF52, 1INF12, 1INF59, 1INF60, 1INF03, 1INF61, además de cursos de posgrado.
  - *Ciberseguridad* (interdisciplinaria; Informática lleva 4 del Grupo A): 1INF22, 1INF20, TEL618, 1INF21.
  - *Gestión de TI* (amplitud): 1INF41 como base y luego hasta 3 de 1INF08, 1INF22, INF340, INF390.
  - *IA Aplicada* no aplica, porque está dirigida a otras especialidades.
- Login con la cuenta PUCP.
- Registro de la decisión final ("se abrirá / no se abrirá") visible para los alumnos.
- Electivos de libre disponibilidad y de otras facultades.
