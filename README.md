# Votación de electivos · Ingeniería Informática PUCP

Proyecto con API NestJS, PostgreSQL y una web React/Vite. Cada votación tiene su propia malla, padrón e historial académico. Los originales CSV/Excel se guardan en un bucket privado de Supabase Storage; PostgreSQL guarda los datos procesados y las referencias a esos archivos.

Esta es la versión vigente. Las reglas están en [docs/SISTEMA.md](docs/SISTEMA.md). Si tienes una BD de la versión anterior, empieza desde cero siguiendo [docs/REINICIO_BD.md](docs/REINICIO_BD.md).

## Instalación en otra computadora

Necesitas Node.js 20 o superior con npm, Docker con Docker Compose y acceso a un proyecto de Supabase con un bucket privado. Docker debe estar iniciado. Git solo es necesario si clonas el repositorio; también puedes descomprimir la entrega ZIP.

Ejecuta los comandos desde la carpeta que contiene este README y `package.json`:

```sh
npm ci
```

Copia `apps/api/.env.example` a `apps/api/.env`:

```sh
# Linux / macOS
cp apps/api/.env.example apps/api/.env
```

```powershell
# Windows PowerShell
Copy-Item apps/api/.env.example apps/api/.env
```

Edita `apps/api/.env` antes de cargar archivos:

| Variable | Qué configurar |
| --- | --- |
| `DATABASE_URL` | El valor del ejemplo funciona con el Docker Compose incluido. |
| `JWT_SECRET` | Un secreto propio para las sesiones. |
| `COORD_USER`, `COORD_PASSWORD` | Credenciales del coordinador que se creará en una base nueva. |
| `SUPABASE_URL` | URL del proyecto de Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servicio del proyecto; se usa solo en la API. |
| `SUPABASE_STORAGE_BUCKET` | Nombre del bucket privado existente, por ejemplo `votainf-importaciones`. |
| `PORT`, `WEB_ORIGIN` | Por defecto `3000` y `http://localhost:5173`. |

Cada equipo puede usar su propio Supabase o uno compartido autorizado. Las credenciales no se incluyen en el repositorio ni en el ZIP. No pongas la clave de servicio en el frontend ni en variables `VITE_`.

Después:

```sh
docker compose up -d
npm run dev
```

`npm run dev` genera el cliente Prisma, aplica **todas las migraciones pendientes**, crea el coordinador si falta y arranca API y web. No hay que ejecutar los SQL a mano ni resetear la BD.

- Web: http://localhost:5173
- API: http://localhost:3000/api
- PostgreSQL local: `localhost:5432`, base/usuario/contraseña `votacion` con el Compose incluido.

La instalación nueva empieza sin votaciones, alumnos ni votos. Si no cambiaste las credenciales del ejemplo, el coordinador es `coordinador` / `Coordinador#2026`.

### Inicio con doble clic en Windows

Después de configurar `.env`, puedes usar `iniciar.bat`. Comprueba dependencias, inicia PostgreSQL local mediante Docker si hace falta y ejecuta el mismo arranque con migraciones. No genera un ejecutable independiente: necesita Node.js y PostgreSQL. En Linux/macOS también puedes usar `node scripts/iniciar.mjs`.

## Preparar una votación de prueba

1. Entra como coordinador, abre **Alumnos** e importa `docs/datos-prueba/02_alumnos.csv` para crear las 16 cuentas globales.
2. Pulsa **Nueva votación**. En el borrador carga `01_malla.csv` y luego `03_historial.csv`, disponibles en [docs/datos-prueba](docs/datos-prueba) y **Plantillas**.
3. Comprueba que aparecen 54 electivos, 16 alumnos y 751 registros académicos. La malla completa contiene 148 cursos, incluidos los obligatorios usados para evaluar requisitos.
4. Abre la votación para publicarla. Las cuentas registradas ya permiten iniciar sesión; solo los alumnos incluidos en su historial verán la votación. Los demás verán «No tienes votaciones disponibles».
5. Los códigos de prueba y sus casos están en [docs/datos-prueba/README.md](docs/datos-prueba/README.md). La contraseña de los 16 alumnos es `Alumno#2026`.

Las plantillas vacías/de ejemplo Excel están en `docs/plantillas`. Los CSV de prueba son un conjunto compatible entre sí: usa los tres de esta versión. Una nota vacía en el historial significa que el curso está en progreso.

## Si ya tenías la versión anterior

Esta entrega se prepara con una **BD limpia**: no se reutilizan votaciones ni archivos de los períodos antiguos. Detén API y web, configura `.env` y ejecuta una sola vez:

```sh
npm ci
docker compose up -d
npm run db:reset
npm run dev
```

`db:reset` elimina los registros anteriores y reconstruye la estructura actual; después crea únicamente el coordinador. Los CSV de prueba permanecen en el repositorio para cargarlos manualmente en una votación nueva. Consulta [docs/REINICIO_BD.md](docs/REINICIO_BD.md) para respaldar antes y conocer el alcance.

En una instalación nueva no hace falta `db:reset`: sigue la instalación normal. Para los siguientes arranques usa solo `npm run dev`; no reinicies la BD cada vez. El push comparte código, no tus registros de PostgreSQL.

## Comandos de desarrollo

```sh
npm run dev              # prepara BD y arranca API + web
npm run lint             # comprobación de tipos
npm test                 # pruebas del motor de requisitos
npm run test:e2e:local    # integración en BD temporal aislada, sin Docker ni Supabase real
npm run build            # compila API y web
```

`test:e2e:local` usa el puerto temporal `54339` y descarta la BD al terminar. También existe `npm run test:e2e` contra PostgreSQL con una base separada terminada en `_test`.

Para detener API y web: `Ctrl+C`. Para detener PostgreSQL conservando sus datos: `docker compose stop`. `npm run db:reset` es solo para empezar de cero: borra los datos locales y crea únicamente el coordinador.

## Archivos que se entregan

- `apps/api`: API, esquema Prisma, migraciones, seed mínimo y pruebas.
- `apps/web`: interfaz y configuración de Vite.
- `docs`: reglas vigentes, reinicio de BD, referencia del plan y archivos de prueba.
- `docker-compose.yml`, `iniciar.bat`, `scripts/iniciar.mjs`: arranque local.
- `package.json` y `package-lock.json`: dependencias y comandos reproducibles con `npm ci`.

No se entregan `.env`, `node_modules`, `dist`, configuraciones del IDE ni credenciales. Las migraciones antiguas se mantienen porque Prisma las necesita para crear y actualizar la BD; no son versiones alternativas de la aplicación.
