// Tipos de las respuestas del API (reflejan los servicios de apps/api).

export type Rol = 'ALUMNO' | 'COORDINADOR';
export type Aptitud = 'CONFIRMADO' | 'CONDICIONAL' | 'NO_APTO';
export type EstadoProceso = 'BORRADOR' | 'ABIERTO' | 'CERRADO';
export type Franja = 'MANANA' | 'MEDIA_MANANA' | 'MEDIODIA' | 'TARDE' | 'NOCHE';
export type TipoCurso = 'OBLIGATORIO' | 'ELECTIVO' | 'ELECTIVO_GENERALES' | 'ELECTIVO_LIBRE';
export type ConteoFranjas = Record<Franja, number>;

export interface Usuario {
  id: string;
  codigo: string;
  nombres: string;
  apellidos: string;
  rol: Rol;
}

export interface Proceso {
  id: string;
  nombre: string;
  cicloObjetivo: string;
  cicloActual?: string;
  primeraApertura?: string | null;
  catalogo?: { codigo: string; tipo: TipoCurso }[] | null;
  fechaInicio: string;
  fechaFin: string;
  maxCursos: number;
  maxFranjas: number;
  estado: EstadoProceso;
  createdAt: string;
  updatedAt: string;
  _count?: { padron: number; votos: number; historial?: number };
}

export interface EvaluacionRequisito {
  termino: string;
  cumple: boolean;
  dependeDeEnCurso: boolean;
  detalle: string;
}

export interface ResultadoElegibilidad {
  aptitud: Aptitud;
  requisitos: EvaluacionRequisito[];
  cursosEnCursoNecesarios: string[];
  dependeDeCreditosEnCurso: boolean;
}

export interface Creditos {
  aprobados: number;
  enCurso: number;
}

export interface ElectivoAlumno {
  dependencias?: string[];
  avisos?: string[];
  codigo: string;
  nombre: string;
  creditos: number;
  ciclo: number | null;
  descripcion: string | null;
  requisitosTexto: string | null;
  elegibilidad: ResultadoElegibilidad;
  estadoPropio: 'APROBADO' | 'EN_CURSO' | null;
  voto: { franjas: Franja[]; aptitud: Aptitud; createdAt: string } | null;
}

export interface EstadoAlumno {
  proceso: Proceso;
  abierto: boolean;
  terminos: { version: number; texto: string; aceptados: boolean; aceptadoEn: string | null };
  votosUsados: number;
  maxCursos: number;
  maxFranjas: number;
  puedeVotar: boolean;
}

export interface MiVoto {
  id: string;
  cursoCodigo: string;
  cursoNombre: string;
  creditos: number;
  aptitud: Aptitud;
  franjas: Franja[];
  createdAt: string;
}

export interface FilaResultado {
  codigo: string;
  nombre: string;
  creditos: number;
  total: number;
  seleccion?: string;
  consejo?: string;
  dictado?: string;
  confirmados: number;
  condicionales: number;
  franjas: ConteoFranjas;
}

export interface ResultadosPublicos {
  proceso: Pick<Proceso, 'id' | 'nombre' | 'cicloObjetivo' | 'estado' | 'fechaFin'>;
  totalVotos: number;
  ranking: Pick<
    FilaResultado,
    'codigo' | 'nombre' | 'creditos' | 'total' | 'franjas' | 'seleccion' | 'consejo' | 'dictado'
  >[];
}

export interface Aviso {
  nivel: 'info' | 'advertencia';
  mensaje: string;
}

export interface ResultadosCoord {
  proceso: Proceso;
  indicadores: { habilitados: number; votaron: number; participacion: number; totalVotos: number };
  ranking: FilaResultado[];
  avisos: Aviso[];
  filtroAptitud: Aptitud | null;
}

export interface DetalleCursoCoord {
  proceso: Pick<Proceso, 'id' | 'nombre' | 'estado'>;
  curso: {
    codigo: string;
    nombre: string;
    creditos: number;
    tipo: TipoCurso;
    requisitosTexto: string | null;
    descripcion: string | null;
  };
  total: number;
  confirmados: number;
  condicionales: number;
  franjas: ConteoFranjas;
  votantes: {
    codigo: string;
    nombres: string;
    apellidos: string;
    correo: string | null;
    aptitud: Aptitud;
    franjas: Franja[];
    createdAt: string;
  }[];
}

export interface CursoCoord {
  codigo: string;
  nombre: string;
  creditos: number;
  tipo: TipoCurso;
  ciclo: number | null;
  grupo: string | null;
  requisitosTexto: string | null;
  descripcion: string | null;
  requisitos: { texto: string; tipo: string; cursoRequerido: string | null; creditosMinimos: number | null }[];
  faltaDescripcion: boolean;
}

export interface AlumnoPadron {
  codigo: string;
  nombres: string;
  apellidos: string;
  correo: string | null;
  creditosAprobados: number;
  creditosEnCurso: number;
  votos: number;
  tieneHistorial: boolean;
  terminosAceptados: boolean;
}

export interface DetalleAlumno {
  proceso: { id: string; nombre: string };
  alumno: { id: string; codigo: string; nombres: string; apellidos: string; correo: string | null };
  creditos: Creditos;
  historial: {
    cursoCodigo: string;
    cursoNombre: string | null;
    tipo: TipoCurso | null;
    creditos: number;
    enCatalogo: boolean;
    notas: (number | null)[];
    notaMax: number | null;
    enCurso: boolean;
    aprobado: boolean;
  }[];
  electivos: (Omit<ElectivoAlumno, 'voto'> & {
    voto: { aptitud: Aptitud; franjas: Franja[]; createdAt: string } | null;
  })[];
}

export type TipoImportacion = 'catalogo' | 'cuentas' | 'historial';

export interface PreviewImportacion {
  tipo: TipoImportacion;
  token: string | null;
  proceso: { id: string; nombre: string } | null;
  columnas: string[];
  resumen: { total: number; validas: number; conErrores: number; conAdvertencias: number };
  erroresGenerales: string[];
  advertenciasGenerales: string[];
  filas: { fila: number; datos: Record<string, unknown>; errores: string[]; advertencias: string[] }[];
}
