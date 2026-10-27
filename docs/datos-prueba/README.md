# Datos ficticios para probar una votación

Las descargas de estos archivos se obtienen desde Supabase en la sección Plantillas. Las copias de este directorio solo se usan para publicar nuevas versiones y para pruebas.

Estos archivos conservan las 16 cuentas y los casos académicos de la demostración original, sin crear votaciones ni votos automáticamente.

1. En el navbar del coordinador, abre **Alumnos** y sube `02_alumnos.csv`: crea las 16 cuentas globales. Ya pueden iniciar sesión; todavía no tendrán votaciones disponibles.
2. Crea una votación en borrador (por ejemplo, ciclo actual `2026-2` y objetivo `2027-1`). Sube `01_malla.csv`: 148 cursos, incluidos 54 electivos.
3. En esa votación sube `03_historial.csv`: 751 registros académicos. El historial habilita a los 16 alumnos para esta votación. Una nota vacía indica un curso en progreso.
4. Abre la votación: los alumnos de ese historial podrán verla y votar.

El sistema valida y guarda cada archivo automáticamente. Las cuentas globales se crean o actualizan por código, sin borrar alumnos omitidos. La malla y el historial reemplazan solo los datos del borrador elegido; no se importan cuentas dentro de una votación.

La contraseña de los 16 alumnos es `Alumno#2026`. El coordinador usa `coordinador` y su contraseña configurada mediante `COORD_PASSWORD` (por defecto `Coordinador#2026`); no se incluye en el CSV de alumnos.

Las cuentas permiten iniciar sesión desde su creación; para ver y votar en un período, el alumno debe figurar en su historial y la votación debe estar publicada. Los archivos no contienen votos: todos los cursos comienzan «No votado». Los casos condicionales se muestran en amarillo como «Condicional», con explicación de los requisitos y créditos pendientes al pasar el mouse, y siguen permitiendo el voto condicional.

| Código | Caso de prueba |
| --- | --- |
| 20220101 | Ciclo 5: casi ningún electivo apto |
| 20210202 | Ciclo 6 |
| 20200303 | Ciclo 8 con IA (1INF24) en curso → CONDICIONAL en los electivos de IA |
| 20201234 | Plantilla: 1INF29 con 8 (cumple (1INF29)), 1INF24 y 1INF39 en curso |
| 20195678 | Plantilla: 1INF24 jalado (9) y luego aprobado (15) |
| 20200404 | 1INF29 con 8 y 1INF35 en curso → 1INF51 CONDICIONAL |
| 20190505 | Curso jalado (1INF24: 7) y luego aprobado (14) |
| 20190606 | Llega a 140 créditos solo con los cursos en curso → DER349 CONDICIONAL |
| 20180707 | Último ciclo: apta para casi todo (1INF41 jalado y en curso) |
| 20190808 | Ciclo 9: ya aprobó INF310 y lleva INF356 (etiquetas informativas) |
| 20210909 | Ciclo 6 con un electivo libre del plan de Ingeniería Informática |
| 20201010 | Ciclo 8, línea de seguridad: 1INF39 y 1INF41 en curso |
| 20221111 | Ciclo 3: ningún electivo apto |
| 20201212 | INF238 desaprobado (10) y no lo lleva → [INF238] NO_APTO |
| 20181515 | Ciclo 10 con 15 créditos de libre disponibilidad (cuentan solo 12) |
| 20231414 | Primer ciclo aprobado y cursos del segundo ciclo en progreso |

## Supabase

Configura las credenciales únicamente en `apps/api/.env`:

```dotenv
SUPABASE_URL="https://TU_PROYECTO.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="TU_CLAVE_DE_SERVICIO"
SUPABASE_STORAGE_BUCKET="votainf-importaciones"
```

El bucket debe existir y ser privado. Reinicia la API si cambias estas variables. Los originales se almacenan en Storage; PostgreSQL conserva metadatos y los datos procesados.
