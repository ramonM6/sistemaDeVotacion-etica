# Plantillas y ejemplos en Supabase

La API descarga los tres Excel y los tres CSV únicamente desde el bucket privado indicado por `SUPABASE_STORAGE_BUCKET`. Las rutas son estables:

```text
sistema-votacion/recursos/v1/plantillas/plantilla_malla_curricular.xlsx
sistema-votacion/recursos/v1/plantillas/plantilla_cuentas_alumnos.xlsx
sistema-votacion/recursos/v1/plantillas/plantilla_historial_academico.xlsx
sistema-votacion/recursos/v1/ejemplos/01_malla.csv
sistema-votacion/recursos/v1/ejemplos/02_alumnos.csv
sistema-votacion/recursos/v1/ejemplos/03_historial.csv
```

Las descargas pasan por los endpoints existentes de la API y requieren coordinación. El navegador no recibe la clave de servicio. Si falta la configuración, el objeto o la conexión a Supabase, la descarga devuelve un error; no se sustituye por un archivo local.

## Publicar en otro bucket o actualizar los ejemplos

Configura `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_STORAGE_BUCKET` en `apps/api/.env`, y crea el bucket privado. Desde la raíz del repo:

```sh
npm run plantillas:publicar -w apps/api
```

El comando lee las fuentes versionadas de `docs/plantillas` y `docs/datos-prueba`, sube los seis recursos y verifica sus bytes descargándolos y comparando SHA-256. Actualiza las mismas rutas al ejecutarlo de nuevo. No modifica archivos de votaciones ni cuentas, ni necesita migrar la BD. No se ejecuta automáticamente al arrancar: así no se sobrescriben las plantillas remotas en cada inicio.

Si tus compañeros usan el bucket donde ya se publicaron, no necesitan volver a ejecutar el comando. Para un bucket nuevo, sí. Los directorios locales se conservan como fuentes de publicación y fixtures de pruebas; la aplicación no los consulta al descargar.
