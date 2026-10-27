# Empezar con una BD limpia

Este procedimiento es solo para una BD local descartable. Con Supabase compartido no ejecutes `db:reset`: elimina los datos de todos los integrantes. Para reiniciar una BD local, tanto `DATABASE_URL` como `DIRECT_URL` deben apuntar a esa misma BD local.

Para pasar de la versión anterior a esta entrega se descartan los datos anteriores. No se intentan reutilizar sus votaciones, padrones, historiales, votos, decisiones ni referencias a archivos.

## Respaldo opcional antes de borrar

Detén API y web con `Ctrl+C`. Si deseas conservar una copia, con el Docker Compose incluido puedes ejecutar:

```sh
docker compose exec -T postgres pg_dump -U votacion -d votacion -Fc -f /tmp/votacion-antes-reinicio.dump
docker compose cp postgres:/tmp/votacion-antes-reinicio.dump ./votacion-antes-reinicio.dump
```

Guarda el respaldo fuera del repositorio. Para PostgreSQL instalado por separado usa DBeaver o `pg_dump` con su conexión.

## Reinicio único al cambiar de versión

Desde la raíz del proyecto, verifica que `DATABASE_URL` en `apps/api/.env` corresponda a la BD local que quieres vaciar. Luego:

```sh
npm ci
docker compose up -d
npm run db:reset
npm run dev
```

`db:reset` borra los datos, vuelve a aplicar todas las migraciones y crea el coordinador con `COORD_USER` y `COORD_PASSWORD`. No deja alumnos ni votaciones de ejemplo. No hay que ejecutar SQL manualmente ni copiar datos antiguos.

La secuencia de migraciones se conserva para reconstruir la estructura completa, incluida la eliminación de tablas retiradas. No borres esos archivos. En un clon nuevo basta `npm run dev`: no hay datos anteriores que descartar.

## Después del reinicio

Entra como coordinador, importa `02_alumnos.csv` desde Alumnos, crea una votación nueva y sube su malla e historial descargados desde Plantillas. Abre la votación para habilitarla a los alumnos presentes en ese historial. Los originales se cargarán en el bucket privado configurado en Supabase. No hace falta trasladar archivos antiguos de PostgreSQL.

El reinicio elimina las referencias locales a Storage, pero no borra objetos del bucket de Supabase: pueden estar compartidos con otras instalaciones. Los originales viejos no aparecen en esta BD nueva. No vacíes un bucket compartido para reiniciar el sistema.

Para los siguientes arranques usa `npm run dev`, sin `db:reset`. Tus nuevas votaciones se conservan normalmente.
