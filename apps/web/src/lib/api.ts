import type {
  AlumnoPadron,
  Aptitud,
  CursoCoord,
  DetalleAlumno,
  DetalleCursoCoord,
  ElectivoAlumno,
  EstadoAlumno,
  Franja,
  MiVoto,
  PreviewImportacion,
  Proceso,
  ResultadosCoord,
  ResultadosPublicos,
  TipoCurso,
  TipoImportacion,
  Usuario,
  Creditos,
} from './tipos';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detalles: string[] = [],
  ) {
    super(message);
  }
}

async function solicitar<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const esFormData = opciones.body instanceof FormData;
  const res = await fetch(`/api${ruta}`, {
    credentials: 'same-origin',
    ...opciones,
    headers: {
      Accept: 'application/json',
      ...(opciones.body && !esFormData ? { 'Content-Type': 'application/json' } : {}),
      ...opciones.headers,
    },
  });
  if (res.status === 204) return undefined as T;
  const texto = await res.text();
  const cuerpo = texto ? JSON.parse(texto) : null;
  if (!res.ok) {
    const mensaje = cuerpo?.message;
    const lista: string[] = Array.isArray(mensaje) ? mensaje : mensaje ? [String(mensaje)] : [];
    const principal =
      res.status === 413 ? 'El archivo supera el máximo de 5 MB' : (lista[0] ?? cuerpo?.error ?? `Error ${res.status}`);
    throw new ApiError(res.status, principal, lista);
  }
  return cuerpo as T;
}

const get = <T>(ruta: string) => solicitar<T>(ruta);
const post = <T>(ruta: string, body?: unknown) =>
  solicitar<T>(ruta, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
const patch = <T>(ruta: string, body: unknown) => solicitar<T>(ruta, { method: 'PATCH', body: JSON.stringify(body) });

const qs = (params: Record<string, string | undefined>) => {
  const p = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  // Autenticación
  login: (codigo: string, password: string) => post<Usuario>('/auth/login', { codigo, password }),
  logout: () => post<void>('/auth/logout'),
  me: () => get<Usuario>('/auth/me'),
  procesoActivo: () => get<Proceso | null>('/procesos/activo'),

  // Alumno: todas las operaciones conservan la votación seleccionada.
  procesosAlumno: () => get<Proceso[]>('/alumno/procesos'),
  estadoAlumno: (procesoId?: string) => get<EstadoAlumno>(`/alumno/estado${qs({ procesoId })}`),
  aceptarTerminos: (procesoId?: string) => post(`/alumno/terminos${qs({ procesoId })}`),
  electivos: (procesoId?: string) =>
    get<{ creditos: Creditos; electivos: ElectivoAlumno[] }>(`/alumno/electivos${qs({ procesoId })}`),
  electivo: (codigo: string, procesoId?: string) =>
    get<ElectivoAlumno & { creditosAlumno: Creditos }>(
      `/alumno/electivos/${encodeURIComponent(codigo)}${qs({ procesoId })}`,
    ),
  votar: (cursoCodigo: string, franjas: Franja[], procesoId?: string) =>
    post<MiVoto>(`/alumno/votos${qs({ procesoId })}`, { cursoCodigo, franjas }),
  editarVoto: (cursoCodigo: string, franjas: Franja[], procesoId?: string) =>
    patch(`/alumno/votos/${encodeURIComponent(cursoCodigo)}${qs({ procesoId })}`, { cursoCodigo, franjas }),
  retirarVoto: (codigo: string, procesoId?: string) =>
    solicitar(`/alumno/votos/${encodeURIComponent(codigo)}${qs({ procesoId })}`, { method: 'DELETE' }),
  misVotos: (procesoId?: string) => get<MiVoto[]>(`/alumno/votos${qs({ procesoId })}`),
  resultadosPublicos: (procesoId?: string) => get<ResultadosPublicos>(`/resultados/publicos${qs({ procesoId })}`),
  seguimientoAlumno: (procesoId: string) =>
    get<{ proceso: Proceso; cursos: SeguimientoCurso[] }>(`/alumno/seguimiento${qs({ procesoId })}`),

  seguimiento: (procesoId?: string) =>
    get<{ proceso: Proceso; cursos: SeguimientoCurso[] }>(`/coord/seguimiento${qs({ procesoId })}`),
  decidirCursos: (procesoId: string, etapa: 'seleccion' | 'consejo' | 'dictado', estado: string, codigos: string[]) =>
    post<{ proceso: Proceso; cursos: SeguimientoCurso[] }>(`/coord/seguimiento/lote${qs({ procesoId })}`, {
      etapa,
      estado,
      codigos,
    }),
  guardarSeguimiento: (procesoId: string, codigo: string, d: SeguimientoCurso) =>
    patch(`/coord/seguimiento/${codigo}${qs({ procesoId })}`, {
      seleccion: d.seleccion,
      consejo: d.consejo,
      dictado: d.dictado,
      observacion: d.observacion,
    }),
  previewConsejo: (procesoId: string, csv: string) =>
    post<{ procesoId: string; filas: unknown[] }>(`/coord/seguimiento/csv/preview${qs({ procesoId })}`, { csv }),
  confirmarConsejo: (procesoId: string, csv: string) =>
    post(`/coord/seguimiento/csv/confirmar${qs({ procesoId })}`, { csv }),
  // Coordinador
  procesos: () => get<Proceso[]>('/coord/procesos'),
  reutilizarCatalogo: (id: string, origenId: string) => post(`/coord/procesos/${id}/reutilizar-catalogo`, { origenId }),
  crearProceso: (datos: ProcesoForm) => post<Proceso>('/coord/procesos', datos),
  editarProceso: (id: string, datos: Partial<ProcesoForm>) => patch<Proceso>(`/coord/procesos/${id}`, datos),
  cambiarEstado: (id: string, estado: Proceso['estado']) => patch<Proceso>(`/coord/procesos/${id}/estado`, { estado }),

  archivos: (procesoId?: string) =>
    get<{ id: string; nombre: string; tipo: string; filas: number; sha256: string; createdAt: string }[]>(
      `/coord/import/archivos${qs({ procesoId })}`,
    ),
  urlArchivo: (id: string) => `/api/coord/import/archivos/${id}`,
  previewImportacion: (tipo: TipoImportacion, archivo: File, procesoId?: string) => {
    const fd = new FormData();
    fd.append('archivo', archivo);
    return solicitar<PreviewImportacion>(`/coord/import/${tipo}/preview${qs({ procesoId })}`, {
      method: 'POST',
      body: fd,
    });
  },
  confirmarImportacion: (tipo: TipoImportacion, token: string) =>
    post<Record<string, unknown>>(`/coord/import/${tipo}/confirmar`, { token }),
  urlPlantilla: (tipo: TipoImportacion) => `/api/coord/import/${tipo}/plantilla`,

  cursos: (tipo?: TipoCurso) => get<CursoCoord[]>(`/coord/cursos${qs({ tipo })}`),
  editarCurso: (
    codigo: string,
    datos: Partial<Pick<CursoCoord, 'nombre' | 'creditos' | 'descripcion'>> & { requisitosTexto?: string },
  ) => patch<CursoCoord>(`/coord/cursos/${encodeURIComponent(codigo)}`, datos),

  padron: (procesoId?: string) =>
    get<{ proceso: { id: string; nombre: string; maxCursos: number }; alumnos: AlumnoPadron[] }>(
      `/coord/padron${qs({ procesoId })}`,
    ),
  detalleAlumno: (codigo: string, procesoId?: string) =>
    get<DetalleAlumno>(`/coord/padron/${encodeURIComponent(codigo)}${qs({ procesoId })}`),

  resultadosCoord: (procesoId?: string, aptitud?: Aptitud) =>
    get<ResultadosCoord>(`/coord/resultados${qs({ procesoId, aptitud })}`),
  detalleCurso: (codigo: string, procesoId?: string) =>
    get<DetalleCursoCoord>(`/coord/resultados/${encodeURIComponent(codigo)}${qs({ procesoId })}`),
  urlExportResultados: (procesoId?: string, aptitud?: Aptitud) =>
    `/api/coord/export/resultados.xlsx${qs({ procesoId, aptitud })}`,
  urlExportCurso: (codigo: string, procesoId?: string) =>
    `/api/coord/export/cursos/${encodeURIComponent(codigo)}/votantes.xlsx${qs({ procesoId })}`,
};

export interface ProcesoForm {
  nombre: string;
  cicloObjetivo: string;
  cicloActual?: string;
  fechaInicio: string;
  fechaFin: string;
  maxCursos: number;
  maxFranjas: number;
}

export interface SeguimientoCurso {
  codigo: string;
  nombre: string;
  seleccion: string;
  consejo: string;
  dictado: string;
  observacion: string;
  updatedAt?: string;
}
