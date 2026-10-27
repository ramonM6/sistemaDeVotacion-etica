# Actualizar una instalación existente

Estos pasos son para quien ya tiene datos de una versión anterior. Para una base nueva basta con el README.

## 1. Respaldar y detener la aplicación

Detén API y web con `Ctrl+C`. Conserva `apps/api/.env` y el volumen de PostgreSQL. Antes de aplicar cambios, realiza un respaldo con DBeaver o `pg_dump`. Con el Compose incluido puedes generar un respaldo binario sin depender de la redirección de PowerShell:

```sh
docker compose exec -T postgres pg_dump -U votacion -d votacion -Fc -f /tmp/votacion-antes-actualizar.dump
docker compose cp postgres:/tmp/votacion-antes-actualizar.dump ./votacion-antes-actualizar.dump
```

Guarda el respaldo fuera del repositorio/ZIP. Para una base que no usa este Compose, usa su conexión y sus herramientas de respaldo.

## 2. Actualizar código y dependencias

Obtén la versión nueva del código sin reemplazar tu `.env`. Desde la raíz:

```sh
npm ci
docker compose up -d
npm run dev
```

El arranque regenera Prisma y ejecuta `prisma migrate deploy`. No usa `migrate reset`, no borra usuarios/votaciones/votos y no carga una votación de demostración. Si la migración falla, revisa el error y la conexión; no borres el volumen para resolverlo.

Para aplicar solo la estructura, sin levantar la aplicación:

```sh
npm exec -w apps/api -- prisma generate
npm exec -w apps/api -- prisma migrate deploy
```

Conserva todos los directorios de `apps/api/prisma/migrations`, incluidos los que crean y luego eliminan funciones antiguas. Prisma aplica los faltantes en orden y registra los que ya se ejecutaron.

## 3. Qué cambió en la BD

Las migraciones incluyen malla por votación, perfiles del padrón, seguimiento de selección/consejo/dictado y referencias a archivos en Supabase. También eliminan la función de intereses y la tabla de aceptación de términos. Esas dos funciones y sus registros ya no forman parte del sistema.

La actualización no elimina automáticamente votaciones de demostración antiguas ni reemplaza sus archivos; la limpieza realizada en la computadora del autor no se ejecuta en las demás instalaciones. Los CSV actualizados se importan desde la interfaz cuando corresponda, únicamente en borradores sin apertura previa.

## 4. Solo si había originales guardados en PostgreSQL

Configura las tres variables `SUPABASE_*` y crea el bucket privado antes de ejecutar:

```sh
cd apps/api
node --import tsx scripts/migrar-archivos-storage.ts
```

Este script conserva los metadatos, sube cada original a Storage y solo después vacía su contenido antiguo en PostgreSQL. Se puede volver a ejecutar si se interrumpe. Mantén el `ARCHIVOS_SECRET` original o, si no existía, el `JWT_SECRET` original hasta completar el traslado. Una instalación nueva no necesita este paso.

La columna de contenido antigua permanece nullable para permitir esta actualización; las nuevas cargas guardan los originales exclusivamente en Storage. No elimines el script ni esa compatibilidad mientras existan instalaciones antiguas por migrar.

## Trasladar todos los datos a otra computadora

El ZIP incluye código, no tu BD ni las credenciales. Para reproducir exactamente una instalación, restaura el respaldo en el PostgreSQL destino y configura el mismo bucket privado, o copia también los objetos si cambias de proyecto Supabase. Un respaldo de PostgreSQL contiene referencias a Storage, no los archivos originales. Nunca uses `docker compose down -v` para actualizar: elimina el volumen local.
