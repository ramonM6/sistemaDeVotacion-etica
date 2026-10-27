/**
 * Tipos del motor de requisitos (sección 6 de la especificación).
 * Este módulo es puro: no depende de Nest ni de Prisma, para poder probarlo aislado.
 */

export type TipoRequisito =
  'APROBADO' | 'CURSADO_NOTA_MIN_8' | 'APROBADO_O_SIMULTANEO' | 'CURSADO_O_SIMULTANEO' | 'CREDITOS_MIN';

export type TipoCurso = 'OBLIGATORIO' | 'ELECTIVO' | 'ELECTIVO_GENERALES' | 'ELECTIVO_LIBRE';

export type Aptitud = 'CONFIRMADO' | 'CONDICIONAL' | 'NO_APTO';

/** Un término ya reconocido de la columna `requisitos`. */
export interface TerminoRequisito {
  /** Texto original del término, sin espacios sobrantes (ej. "(1INF29)"). */
  texto: string;
  tipo: TipoRequisito;
  /** Código del curso requerido; ausente en CREDITOS_MIN. */
  cursoRequerido?: string;
  /** Mínimo de créditos; solo en CREDITOS_MIN. */
  creditosMinimos?: number;
}

export interface ErrorParseo {
  termino: string;
  mensaje: string;
}

export interface ResultadoParseo {
  terminos: TerminoRequisito[];
  errores: ErrorParseo[];
}

/** Una fila del historial académico. `nota = null` significa "en curso". */
export interface HistorialEntrada {
  cursoCodigo: string;
  nota: number | null;
}

/** Estado consolidado de un curso para un alumno (varias filas → una). */
export interface EstadoCurso {
  /** Nota máxima registrada, o null si solo hay filas en curso. */
  notaMax: number | null;
  /** true si alguna fila del curso tiene la nota vacía. */
  enCurso: boolean;
}

export type HistorialResumido = Map<string, EstadoCurso>;

export interface CursoCatalogo {
  codigo: string;
  creditos: number;
  tipo: TipoCurso;
}

export interface Creditos {
  aprobados: number;
  enCurso: number;
}

export interface ContextoAlumno {
  historial: HistorialResumido;
  creditos: Creditos;
}

export interface EvaluacionRequisito {
  termino: string;
  cumple: boolean;
  dependeDeEnCurso: boolean;
  requiereSimultaneo?: boolean;
  detalle: string;
}

export interface ResultadoElegibilidad {
  aptitud: Aptitud;
  requisitos: EvaluacionRequisito[];
  /** Cursos en curso que el alumno debe aprobar para que la aptitud se confirme. */
  cursosEnCursoNecesarios: string[];
  /** true si algún requisito de créditos solo se alcanza sumando los créditos en curso. */
  dependeDeCreditosEnCurso: boolean;
}

export interface OpcionesEvaluacion {
  /** Si es true, `[X]` y `{X}` se aceptan siempre (el alumno podría llevar X en paralelo). */
  simultaneoPermisivo?: boolean;
}
