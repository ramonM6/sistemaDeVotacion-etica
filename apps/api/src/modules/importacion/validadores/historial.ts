import { HojaLeida, texto } from '../excel';
import { numero } from './catalogo';
import { FilaPreview, RE_CODIGO_ALUMNO, RE_CODIGO_CURSO, ResultadoValidacion } from './tipos';

export const COLUMNAS_HISTORIAL = ['codigo_alumno', 'codigo_curso'];
export const COLUMNAS_HISTORIAL_OPCIONALES = ['nota'];

export interface HistorialImportado {
  codigoAlumno: string;
  codigoCurso: string;
  /** null = en curso */
  nota: number | null;
}

export function validarHistorial(
  hoja: HojaLeida,
  alumnosPadron: Set<string>,
  cursosCatalogo: Set<string>,
): ResultadoValidacion<HistorialImportado> {
  const filas: FilaPreview<HistorialImportado>[] = [];
  const advertenciasGenerales = [...hoja.advertenciasGenerales];
  if (!alumnosPadron.size) {
    advertenciasGenerales.push('No hay cuentas de alumnos registradas: impórtalas primero desde Alumnos');
  }

  for (const { fila, valores } of hoja.filas) {
    const errores: string[] = [];
    const advertencias: string[] = [];

    const codigoAlumno = texto(valores.codigo_alumno) ?? '';
    if (!codigoAlumno) errores.push('Falta el código de alumno');
    else if (!RE_CODIGO_ALUMNO.test(codigoAlumno)) errores.push(`Código de alumno "${codigoAlumno}" inválido`);
    else if (!alumnosPadron.has(codigoAlumno))
      errores.push(`El alumno ${codigoAlumno} no tiene una cuenta registrada. Impórtalo primero desde Alumnos`);

    const codigoCurso = (texto(valores.codigo_curso) ?? '').toUpperCase();
    if (!codigoCurso) errores.push('Falta el código de curso');
    else if (!RE_CODIGO_CURSO.test(codigoCurso)) errores.push(`Código de curso "${codigoCurso}" inválido`);
    else if (!cursosCatalogo.has(codigoCurso)) {
      advertencias.push(`El curso ${codigoCurso} no está en el catálogo: se guarda, pero aporta 0 créditos`);
    }

    let nota: number | null = null;
    if (valores.nota !== null) {
      const n = numero(valores.nota);
      if (n === null || !Number.isInteger(n) || n < 0 || n > 20) {
        errores.push(`Nota "${valores.nota}" inválida: entero de 0 a 20 (vacía = en curso)`);
      } else nota = n;
    }

    filas.push({ fila, datos: { codigoAlumno, codigoCurso, nota }, errores, advertencias });
  }
  return { filas, erroresGenerales: [...hoja.erroresGenerales], advertenciasGenerales };
}
