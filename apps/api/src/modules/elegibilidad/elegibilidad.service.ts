import { Injectable, NotFoundException } from '@nestjs/common';
import { Db, ElegibilidadRepository } from './elegibilidad.repository';
import {
  ContextoAlumno,
  CursoCatalogo,
  HistorialEntrada,
  NOTA_APROBATORIA,
  ResultadoElegibilidad,
  TerminoRequisito,
  calcularCreditos,
  evaluarElegibilidad,
  resumirHistorial,
} from './motor';

export interface ElectivoCatalogo {
  codigo: string;
  nombre: string;
  creditos: number;
  ciclo: number | null;
  descripcion: string | null;
  requisitosTexto: string | null;
  terminos: TerminoRequisito[];
}

export interface Catalogo {
  cursos: Map<string, CursoCatalogo & { nombre: string }>;
  electivos: ElectivoCatalogo[];
}

/** Etiqueta informativa: el alumno puede votar por un electivo que ya aprobó o está llevando. */
export type EstadoPropio = 'APROBADO' | 'EN_CURSO' | null;

export interface ElectivoEvaluado extends Omit<ElectivoCatalogo, 'terminos'> {
  elegibilidad: ResultadoElegibilidad;
  estadoPropio: EstadoPropio;
  dependencias?: string[];
  avisos?: string[];
}

/**
 * Calcula la elegibilidad al vuelo a partir del catálogo y del historial del proceso.
 * Toda la lógica de reglas vive en ./motor (puro y con tests); aquí solo se cargan datos.
 */
@Injectable()
export class ElegibilidadService {
  constructor(private readonly repo: ElegibilidadRepository) {}

  async cargarCatalogo(db?: Db, procesoId?: string): Promise<Catalogo> {
    const guardado = procesoId ? await this.repo.catalogoDeProceso(procesoId, db) : null;
    const filas = guardado
      ? (guardado as unknown as Awaited<ReturnType<ElegibilidadRepository['cursosConRequisitos']>>)
      : await this.repo.cursosConRequisitos(db);
    const cursos: Catalogo['cursos'] = new Map();
    const electivos: ElectivoCatalogo[] = [];
    for (const c of filas) {
      const creditos = Number(c.creditos);
      cursos.set(c.codigo, { codigo: c.codigo, nombre: c.nombre, creditos, tipo: c.tipo });
      if (c.tipo !== 'ELECTIVO') continue;
      electivos.push({
        codigo: c.codigo,
        nombre: c.nombre,
        creditos,
        ciclo: c.ciclo,
        descripcion: c.descripcion,
        requisitosTexto: c.requisitosTexto,
        terminos: c.requisitos.map((r) => ({
          texto: r.texto,
          tipo: r.tipo,
          ...(r.cursoRequerido ? { cursoRequerido: r.cursoRequerido } : {}),
          ...(r.creditosMinimos !== null ? { creditosMinimos: r.creditosMinimos } : {}),
        })),
      });
    }
    return { cursos, electivos };
  }

  construirContexto(entradas: HistorialEntrada[], catalogo: Catalogo): ContextoAlumno {
    const historial = resumirHistorial(entradas);
    return { historial, creditos: calcularCreditos(historial, catalogo.cursos) };
  }

  async contextoAlumno(procesoId: string, usuarioId: string, catalogo?: Catalogo, db?: Db) {
    const cat = catalogo ?? (await this.cargarCatalogo(db, procesoId));
    const entradas = await this.repo.historialDeAlumno(procesoId, usuarioId, db);
    return { catalogo: cat, entradas, contexto: this.construirContexto(entradas, cat) };
  }

  evaluar(electivo: ElectivoCatalogo, contexto: ContextoAlumno): ElectivoEvaluado {
    const { terminos, ...datos } = electivo;
    const estado = contexto.historial.get(electivo.codigo);
    let estadoPropio: EstadoPropio = null;
    if (estado?.notaMax !== null && estado?.notaMax !== undefined && estado.notaMax >= NOTA_APROBATORIA) {
      estadoPropio = 'APROBADO';
    } else if (estado?.enCurso) {
      estadoPropio = 'EN_CURSO';
    }
    return { ...datos, elegibilidad: evaluarElegibilidad(terminos, contexto), estadoPropio };
  }

  plan(catalogo: Catalogo, contexto: ContextoAlumno, codigo: string) {
    const necesarios = new Set<string>();
    const visitar = (actual: string) => {
      if (necesarios.has(actual)) return;
      necesarios.add(actual);
      const curso = catalogo.electivos.find((e) => e.codigo === actual);
      for (const t of curso?.terminos ?? []) {
        if (!['APROBADO_O_SIMULTANEO', 'CURSADO_O_SIMULTANEO'].includes(t.tipo)) continue;
        if (evaluarElegibilidad([t], contexto).aptitud !== 'NO_APTO') continue;
        if (t.cursoRequerido && catalogo.cursos.get(t.cursoRequerido)?.tipo === 'ELECTIVO') visitar(t.cursoRequerido);
      }
    };
    visitar(codigo);
    return [...necesarios].map((actual) => {
      const curso = catalogo.electivos.find((e) => e.codigo === actual);
      if (!curso) throw new NotFoundException('Electivo no encontrado');
      const avisos: string[] = [];
      const simultaneos = curso.terminos.filter((t) => {
        if (
          !['APROBADO_O_SIMULTANEO', 'CURSADO_O_SIMULTANEO'].includes(t.tipo) ||
          evaluarElegibilidad([t], contexto).aptitud !== 'NO_APTO'
        )
          return false;
        const requerido = catalogo.cursos.get(t.cursoRequerido ?? '');
        if (requerido?.tipo === 'OBLIGATORIO') {
          avisos.push(`Deberás matricularte también en ${t.cursoRequerido}.`);
          return true;
        }
        return requerido?.tipo === 'ELECTIVO' && necesarios.has(t.cursoRequerido!);
      });
      const e = this.evaluar({ ...curso, terminos: curso.terminos.filter((t) => !simultaneos.includes(t)) }, contexto);
      for (const t of simultaneos)
        e.elegibilidad.requisitos.push({
          termino: t.texto,
          cumple: true,
          dependeDeEnCurso: false,
          detalle: `Debes llevar ${t.cursoRequerido} en simultáneo el próximo ciclo`,
        });
      if (e.estadoPropio) {
        e.elegibilidad.aptitud = 'NO_APTO';
        e.elegibilidad.requisitos.push({
          termino: curso.codigo,
          cumple: false,
          dependeDeEnCurso: false,
          detalle: 'Ya aprobaste este curso o lo estás llevando actualmente',
        });
      } else if (simultaneos.length && e.elegibilidad.aptitud === 'CONFIRMADO') e.elegibilidad.aptitud = 'CONDICIONAL';
      return { ...e, dependencias: [...necesarios].filter((c) => c !== actual), avisos };
    });
  }

  async planEleccion(procesoId: string, usuarioId: string, codigo: string, db?: Db) {
    const { catalogo, contexto } = await this.contextoAlumno(procesoId, usuarioId, undefined, db);
    return this.plan(catalogo, contexto, codigo);
  }

  /** Todos los electivos con su aptitud para el alumno. */
  async evaluarAlumno(procesoId: string, usuarioId: string) {
    const { catalogo, entradas, contexto } = await this.contextoAlumno(procesoId, usuarioId);
    return {
      creditos: contexto.creditos,
      entradas,
      contexto,
      catalogo,
      electivos: catalogo.electivos.map((e) => {
        const plan = this.plan(catalogo, contexto, e.codigo);
        const principal = plan[0];
        if (plan.some((c) => c.elegibilidad.aptitud === 'NO_APTO')) {
          principal.elegibilidad.aptitud = 'NO_APTO';
          if (plan.slice(1).some((c) => c.elegibilidad.aptitud === 'NO_APTO'))
            principal.avisos.push('Un electivo requerido en simultáneo no es apto para ti');
        }
        return principal;
      }),
    };
  }

  /** Aptitud de un solo electivo (para validar un voto; acepta la transacción en curso). */
  async evaluarElectivo(procesoId: string, usuarioId: string, codigo: string, db?: Db): Promise<ElectivoEvaluado> {
    const { catalogo, contexto } = await this.contextoAlumno(procesoId, usuarioId, undefined, db);
    const electivo = catalogo.electivos.find((e) => e.codigo === codigo);
    if (!electivo) throw new NotFoundException(`El curso ${codigo} no es un electivo del catálogo`);
    return this.evaluar(electivo, contexto);
  }

  /** Créditos aprobados y en curso de todos los alumnos con historial en el proceso. */
  async creditosPorAlumno(procesoId: string, catalogo?: Catalogo) {
    const cat = catalogo ?? (await this.cargarCatalogo(undefined, procesoId));
    const filas = await this.repo.historialDeProceso(procesoId);
    const porAlumno = new Map<string, HistorialEntrada[]>();
    for (const f of filas) {
      const lista = porAlumno.get(f.usuarioId) ?? [];
      lista.push(f);
      porAlumno.set(f.usuarioId, lista);
    }
    const resultado = new Map<string, { aprobados: number; enCurso: number }>();
    for (const [usuarioId, entradas] of porAlumno) {
      resultado.set(usuarioId, this.construirContexto(entradas, cat).creditos);
    }
    return resultado;
  }
}
