# Votación de electivos · Ingeniería Informática PUCP

API NestJS + Prisma, interfaz React/Vite y PostgreSQL local. Las cuentas de alumnos son globales; cada votación tiene su propia malla e historial, que determina quién puede participar. Los archivos originales, las plantillas y los ejemplos descargables se guardan en Supabase Storage privado.

## 1. Requisitos

- Git, para clonar el repositorio.
- Node.js **20 o superior** y npm.
- Docker con Docker Compose; en Windows puedes usar Docker Desktop. Déjalo iniciado.
- Acceso al proyecto/bucket privado de Supabase usado por el equipo y sus credenciales de servidor.

Los puertos por defecto son `5432` (PostgreSQL), `3000` (API) y `5173` (web). Los siguientes comandos se ejecutan desde la raíz del proyecto, donde están este README y `package.json`.

## 2. Clonar e instalar

Mientras los cambios estén en `feature/nuevos-requisitos`, clona esa rama:

```sh
git clone --branch feature/nuevos-requisitos https://github.com/ramonM6/sistemaDeVotacion-etica.git
cd sistemaDeVotacion-etica
npm ci
```

La rama debe estar subida a GitHub para que tus compañeros puedan obtenerla. Si el repositorio es privado, necesitarán acceso. Si ya lo clonaron, pueden actualizarlo con Git y cambiar a esa rama antes de ejecutar `npm ci`.

## 3. Configurar el entorno

Copia el archivo de ejemplo. Solo es necesario la primera vez; conserva tu `.env` en los siguientes arranques.

**Windows PowerShell:**

```powershell
Copy-Item apps/api/.env.example apps/api/.env
```

**Linux / macOS:**

```sh
cp apps/api/.env.example apps/api/.env
```

Abre `apps/api/.env` y completa:

| Variable | Configuración |
| --- | --- |
| `DATABASE_URL` | Con el Docker Compose incluido: `postgresql://votacion:votacion@localhost:5432/votacion?schema=public`. |
| `JWT_SECRET` | Un secreto propio para las sesiones. |
| `COORD_USER` | Usuario del coordinador que se creará. Por defecto `coordinador`. |
| `COORD_PASSWORD` | Contraseña inicial del coordinador. Por defecto `Coordinador#2026`. |
| `SUPABASE_URL` | URL del proyecto de Supabase del equipo. |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave de servicio de ese proyecto; solo la usa la API. |
| `SUPABASE_STORAGE_BUCKET` | Bucket privado existente, por defecto `votainf-importaciones`. |
| `PORT`, `WEB_ORIGIN` | Por defecto `3000` y `http://localhost:5173`. |

Las credenciales de Supabase se comparten por separado entre los integrantes autorizados: **no están en GitHub**. No pongas la clave de servicio en el frontend ni en variables `VITE_`.

El bucket del equipo ya contiene los seis recursos de Plantillas. Si configuras otro proyecto/bucket, primero cópialos respetando las rutas de [PLANTILLAS_SUPABASE.md](docs/PLANTILLAS_SUPABASE.md). El arranque y las migraciones no los generan ni los suben. Supabase es necesario también para guardar los CSV que importes desde tu equipo.

## 4. Arrancar por primera vez

```sh
docker compose up -d
npm run dev
```

El arranque genera el cliente Prisma, aplica **todas las migraciones pendientes**, crea el coordinador si falta y levanta API y web. No debes ejecutar SQL manualmente ni reiniciar una BD nueva.

Abre **http://localhost:5173**. La API está en **http://localhost:3000/api**.

Una instalación nueva empieza **solo con el coordinador**, sin alumnos, votaciones ni votos. Los CSV del repositorio no se cargan automáticamente.

### Alternativa: doble clic en Windows

Después de configurar `.env`, puedes usar **`iniciar.bat`** en lugar de escribir los comandos de arranque. Es un atajo de Windows que llama a `scripts/iniciar.mjs`; no es un ejecutable independiente.

El script comprueba Node/npm, ejecuta `npm ci` si faltan dependencias o cambió el lock, comprueba PostgreSQL y lo inicia mediante Docker si es local y hace falta, comprueba los puertos y ejecuta `npm run dev`. Abre el navegador cuando la web está lista. Si prefieres abrirlo tú, usa `iniciar.bat --sin-navegador`.

No borra la BD ni vuelve a cargar alumnos o plantillas. En Linux/macOS existe el mismo asistente:

```sh
node scripts/iniciar.mjs
```

## 5. Cargar los datos para la presentación

Los tres archivos están en [docs/datos-prueba](docs/datos-prueba) para poder usarlos directamente. También puedes descargarlos desde **Plantillas** dentro del sistema.

1. Inicia sesión como coordinador con las credenciales de la siguiente sección.
2. En el navbar, entra a **Alumnos** y sube `docs/datos-prueba/02_alumnos.csv`. Esto crea las **16 cuentas globales**. Ya pueden iniciar sesión, aunque todavía no tengan votaciones disponibles.
3. En **Votaciones → Nueva votación**, crea un borrador. Puedes indicar ciclo actual `2026-2` y objetivo `2027-1`; elige fechas que incluyan el momento de la presentación.
4. Adjunta `01_malla.csv` y después `03_historial.csv`, o súbelos desde **Datos y archivos** del borrador. Las cuentas no se cargan dentro de la votación.
5. Comprueba que hay **54 electivos**, **16 alumnos** en el padrón y **751 registros académicos**. La malla completa contiene 148 cursos, incluidos los obligatorios necesarios para evaluar requisitos.
6. Pulsa **Abrir votación**. Los alumnos incluidos en ese historial podrán verla y votar. Una cuenta que no figure en ningún historial publicado verá «No tienes votaciones disponibles».
7. Entra con una cuenta de alumno, marca hasta **5 electivos**, elige **1–2 franjas por curso** y confirma. Los resultados se muestran en vivo. Para gestionar las tres etapas de decisión del coordinador, cierra primero la votación.

La API valida y guarda cada archivo automáticamente. Una nota vacía en el historial significa que el curso está en progreso. La etiqueta **Condicional** informa de requisitos pendientes: el voto cuenta desde que se registra. Los casos de cada cuenta se explican en [DATOS_PRUEBA.md](docs/DATOS_PRUEBA.md).

Las descargas de Plantillas siguen obteniéndose exclusivamente desde Supabase; la API no lee los tres CSV locales como alternativa. Se conservan en GitHub para la presentación. Las pruebas generan sus propios archivos ficticios en memoria.

## 6. Usuarios y contraseñas de prueba

### Coordinador

| Usuario | Contraseña por defecto |
| --- | --- |
| `coordinador` | `Coordinador#2026` |

Estos valores vienen de `COORD_USER` y `COORD_PASSWORD` en `.env`. El seed crea la cuenta si no existe; cambiar esas variables no reemplaza automáticamente la contraseña de una cuenta ya creada.

### Alumnos

**Primero importa `02_alumnos.csv` desde Alumnos.** El usuario es la columna `codigo` y la contraseña está en `password`. Estas son las 16 cuentas ficticias del archivo:

| Usuario | Alumno | Contraseña |
| --- | --- | --- |
| `20220101` | Ana Lucía Torres Medina | `Alumno#2026` |
| `20210202` | Bruno Castillo Ramos | `Alumno#2026` |
| `20200303` | Carla Huamán Flores | `Alumno#2026` |
| `20201234` | María Fernanda Quispe Rojas | `Alumno#2026` |
| `20195678` | Luis Alberto Gonzales Paredes | `Alumno#2026` |
| `20200404` | Diego Salazar Vega | `Alumno#2026` |
| `20190505` | Elena Ríos Paredes | `Alumno#2026` |
| `20190606` | Fernando Quispe Mamani | `Alumno#2026` |
| `20180707` | Gabriela Mendoza Chávez | `Alumno#2026` |
| `20190808` | Hugo Paredes Lazo | `Alumno#2026` |
| `20210909` | Isabel Cárdenas Soto | `Alumno#2026` |
| `20201010` | Jorge Villanueva Rojas | `Alumno#2026` |
| `20221111` | Karen Espinoza Díaz | `Alumno#2026` |
| `20201212` | Luis Gutiérrez Núñez | `Alumno#2026` |
| `20181515` | Olga Ramírez León | `Alumno#2026` |
| `20231414` | Nicolás Herrera Campos | `Alumno#2026` |

No se crean al clonar ni al arrancar. Una vez importadas pueden iniciar sesión; el historial y la publicación de cada votación determinan a cuáles tienen acceso.

## 7. Volver a arrancar y detener

Para las siguientes ejecuciones:

```sh
docker compose up -d
npm run dev
```

En Windows también basta `iniciar.bat`. Detén API y web con **Ctrl+C**. Para detener PostgreSQL conservando sus datos:

```sh
docker compose stop
```

El volumen de Docker conserva tus datos. Cada computadora tiene su propia BD: clonar/pushear código o compartir el bucket de Supabase no copia votaciones, alumnos ni votos entre equipos.

## 8. Si ya tenías la BD de la versión anterior

La presentación se prepara con una **BD limpia**, sin reutilizar las votaciones anteriores. Solo en ese caso, detén API/web, configura `.env`, respalda si necesitas conservar algo y ejecuta **una sola vez**:

```sh
npm ci
docker compose up -d
npm run db:reset
npm run dev
```

**`db:reset` elimina los datos de la BD configurada**, reconstruye la estructura actual y crea únicamente el coordinador. Después vuelve a cargar los CSV según la sección 5. No lo ejecutes en cada arranque. Para un clon con BD nueva no hace falta.

Los pasos de respaldo y el alcance están en [REINICIO_BD.md](docs/REINICIO_BD.md). Conserva las migraciones antiguas: Prisma las necesita para reconstruir el esquema, incluida la eliminación de las funciones retiradas.

## 9. Si algo no funciona

| Problema | Qué revisar |
| --- | --- |
| No conecta a PostgreSQL | Docker debe estar iniciado. Ejecuta `docker compose up -d` y revisa `DATABASE_URL`. Si `5432` está ocupado, revisa la instalación de PostgreSQL que ya esté usando ese puerto. |
| No inicia API o web | Los puertos `3000` y `5173` deben estar disponibles; detén una instancia anterior antes de abrir otra. |
| Fallan las cargas o descargas | Revisa las tres variables `SUPABASE_*`, el bucket privado y los objetos de plantilla. Reinicia la API después de cambiar `.env`. |
| El alumno no puede iniciar sesión | Importa primero sus cuentas en **Alumnos** y usa el código/contraseña del CSV; revisa también mayúsculas y caracteres de la contraseña. |
| El alumno entra pero no ve votaciones | Debe estar en el historial académico de una votación publicada. Los borradores no se muestran. |
| El historial rechaza un código | Ese alumno debe tener una cuenta global creada antes de importar el historial. |
| Ves la interfaz anterior | Confirma que estás en `feature/nuevos-requisitos`, que el servidor usa esta carpeta y recarga con `Ctrl+Shift+R`. |

La conexión local para DBeaver, con el Compose incluido, es: host `localhost`, puerto `5432`, base `votacion`, usuario `votacion`, contraseña `votacion`.

## 10. Desarrollo y estructura

```sh
npm run dev              # prepara BD y arranca API + web
npm run lint             # comprobación de tipos
npm test                 # pruebas del motor de requisitos
npm run test:e2e:local    # integración en BD temporal; sin Docker ni Supabase real
npm run build            # compila API y web
```

`test:e2e:local` usa el puerto temporal `54339` y descarta la BD al terminar. También existe `npm run test:e2e` contra PostgreSQL con una base separada terminada en `_test`.

| Ruta | Contenido |
| --- | --- |
| `apps/api` | API, esquema Prisma, migraciones, seed mínimo y pruebas. |
| `apps/web` | Interfaz React y configuración de Vite. |
| `docs/datos-prueba` | Los tres CSV para la presentación. |
| `docs` | Reglas, plan de estudios, cuentas de prueba, reinicio de BD y rutas de Storage. |
| `docker-compose.yml`, `iniciar.bat`, `scripts/iniciar.mjs` | Arranque local. |
| `package.json`, `package-lock.json` | Comandos y dependencias para `npm ci`. |

No se incluyen `.env`, `node_modules`, `dist`, configuraciones del IDE ni claves de Supabase. Las contraseñas ficticias de prueba sí están documentadas arriba y en el CSV.

Referencias: [reglas vigentes](docs/SISTEMA.md), [plan de estudios](docs/PLAN_DE_ESTUDIOS.md), [casos de prueba](docs/DATOS_PRUEBA.md), [Supabase](docs/PLANTILLAS_SUPABASE.md) y [reinicio de BD](docs/REINICIO_BD.md).
