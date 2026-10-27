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

## Otro bucket o actualización de recursos

Los seis archivos ya están publicados en el bucket configurado. No hay copias Excel ni publicador local en el repo. Los tres CSV de `docs/datos-prueba` se conservan para la presentación; las descargas de la API siguen usando exclusivamente Storage. Para conservar los ejemplos puedes descargarlos desde Plantillas o desde el panel de Supabase Storage.

Si se usa otro proyecto/bucket:

1. Descarga los seis objetos del bucket actual mientras tienes acceso a él.
2. Crea un bucket privado en el proyecto destino.
3. Sube los seis archivos a las mismas rutas indicadas arriba mediante el panel de Storage.
4. Configura `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `SUPABASE_STORAGE_BUCKET` en `apps/api/.env`.
5. Reinicia la API y comprueba las descargas desde Plantillas.

Para actualizar un recurso, reemplaza el objeto correspondiente manteniendo su nombre y ruta. Conserva la compatibilidad entre los ejemplos de cuentas, malla e historial. Los datos personales reales no deben convertirse en archivos de ejemplo.

`npm run dev` e `iniciar.bat` no suben ni reemplazan estos recursos. Las migraciones de PostgreSQL tampoco crean archivos en Storage. Las pruebas usan recursos sintéticos generados en memoria; no hacen llamadas a Supabase real.
