# Datos ficticios para probar una votación

Crea una votación nueva en borrador. Puedes indicar ciclo actual `2026-2` y objetivo `2027-1`.
Adjunta y confirma los archivos en este orden:

1. `01_malla.csv`: 3 cursos obligatorios y 6 electivos con distintos requisitos.
2. `02_alumnos.csv`: 4 cuentas ficticias con datos de ingreso, CRAEst y matrícula.
3. `03_historial.csv`: 12 registros; una nota vacía indica un curso en progreso.

Cada importación debe validarse y confirmarse antes de continuar con la siguiente. Utiliza estos archivos en una votación de prueba: las cuentas y el historial reemplazan los datos del borrador elegido.

Después de confirmar las tres importaciones, abre la votación. Si hay otra abierta, ciérrala primero. Inicia sesión con cualquiera de los códigos `20990001`, `20990002`, `20990003` o `20990004`. La contraseña de las cuatro cuentas es `Prueba#2026`.

## Casos para revisar

| Alumno | Caso esperado |
| --- | --- |
| 20990001 | Requisitos base aprobados; puede votar por los 6 electivos, respetando el máximo de 5. |
| 20990002 | INF102 en curso; INF202 se muestra amarillo como «No apto», con explicación y voto condicional. |
| 20990003 | INF102 con nota 8; INF202 no cumple, pero INF206 cumple el requisito de nota mínima 8. |
| 20990004 | Los tres cursos base están en progreso; permite probar aptitud condicional. |

INF201 no tiene requisitos. INF205 incluye INF202 como dependencia simultánea; ambos cuentan dentro del límite de 5 votos. Los archivos no contienen votos: los cursos aparecen «No votado» hasta registrar una elección. Tras cerrar la votación, prueba las decisiones por etapas del coordinador y el seguimiento de lectura del alumno.

## Supabase

Las credenciales se configuran en `apps/api/.env` (no en el frontend):

```dotenv
SUPABASE_URL="https://TU_PROYECTO.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="TU_CLAVE_DE_SERVICIO"
SUPABASE_STORAGE_BUCKET="votainf-importaciones"
```

El bucket debe existir y ser privado. Reinicia la API después de cambiar estas variables. `apps/api/.env.example` contiene el ejemplo sin credenciales. El `.env` local está ignorado por Git.
