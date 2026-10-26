import { FiltrosResultadosDto } from './filtros.dto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Aptitud } from '@prisma/client';
import { ConteoFranjas, FRANJAS, conteoFranjasVacio } from '../../common/franjas';
import { ProcesosService } from '../procesos/procesos.service';
import { ResultadosRepository } from './resultados.repository';

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
  /** Cada voto suma 1 en cada franja marcada (un voto con 2 franjas aporta 1 a cada una). */
  franjas: ConteoFranjas;
}

@Injectable()
export class ResultadosService {
  constructor(
    private readonly repo: ResultadosRepository,
    private readonly procesos: ProcesosService,
  ) {}

  /**
   * Ranking de electivos con al menos un voto, ordenado por total (desc) y código.
   * Es la misma fuente para el dashboard, el mapa de calor y la exportación a Excel.
   */
  async ranking(procesoId: string, aptitud?: Aptitud, filtros: FiltrosResultadosDto = {}): Promise<FilaResultado[]> {
    const proceso = await this.procesos.obtener(procesoId);
    const catalogo = Array.isArray(proceso.catalogo)
      ? (proceso.catalogo as unknown as { codigo: string; nombre: string; creditos: number }[])
      : [];
    const votos = await this.repo.votosDeProceso(procesoId, aptitud, filtros);
    const filas = new Map<string, FilaResultado>();
    for (const v of votos) {
      const fila =
        filas.get(v.cursoCodigo) ??
        ({
          codigo: v.cursoCodigo,
          nombre: catalogo.find((c) => c.codigo === v.cursoCodigo)?.nombre ?? v.curso.nombre,
          creditos: Number(catalogo.find((c) => c.codigo === v.cursoCodigo)?.creditos ?? v.curso.creditos),
          total: 0,
          confirmados: 0,
          condicionales: 0,
          franjas: conteoFranjasVacio(),
        } satisfies FilaResultado);
      fila.total++;
      if (v.aptitud === 'CONFIRMADO') fila.confirmados++;
      else if (v.aptitud === 'CONDICIONAL') fila.condicionales++;
      for (const { franja } of v.franjas) fila.franjas[franja]++;
      filas.set(v.cursoCodigo, fila);
    }
    const decisiones = await this.repo.seguimiento(procesoId);
    return [...filas.values()]
      .map((f) => {
        const decision = decisiones.find((d) => d.cursoCodigo === f.codigo);
        return {
          ...f,
          seleccion: decision?.seleccion ?? 'PENDIENTE',
          consejo: decision?.consejo ?? 'PENDIENTE',
          dictado: decision?.dictado ?? 'PENDIENTE',
        };
      })
      .sort((a, b) => b.total - a.total || a.codigo.localeCompare(b.codigo));
  }

  /** Resultados para alumnos: sin nombres ni datos personales. */
  async publicos() {
    const proceso = await this.procesos.obtenerActivoOFallar();
    const ranking = proceso.estado === 'CERRADO' ? await this.ranking(proceso.id) : [];
    return {
      proceso: {
        id: proceso.id,
        nombre: proceso.nombre,
        cicloObjetivo: proceso.cicloObjetivo,
        estado: proceso.estado,
        fechaFin: proceso.fechaFin,
      },
      totalVotos: ranking.reduce((s, f) => s + f.total, 0),
      ranking: ranking.map(({ codigo, nombre, creditos, total, franjas, seleccion, consejo, dictado }) => ({
        codigo,
        nombre,
        creditos,
        total,
        franjas,
        seleccion,
        consejo,
        dictado,
      })),
    };
  }

  async indicadores(procesoId: string, filtros: FiltrosResultadosDto = {}, aptitud?: Aptitud) {
    const votos = await this.repo.votosDeProceso(procesoId, aptitud, filtros);
    const habilitados = await this.repo.contarPadron(procesoId, filtros);
    const votaron = new Set(votos.map((v) => v.usuarioId)).size;
    return {
      habilitados,
      votaron,
      participacion: habilitados ? Math.round((votaron / habilitados) * 1000) / 10 : 0,
      totalVotos: votos.length,
    };
  }

  async avisos(procesoId: string, estado: string) {
    const [electivos, sinDescripcion, padron, historial, sinHistorial] = await Promise.all([
      this.repo.contarElectivos(),
      this.repo.contarElectivosSinDescripcion(),
      this.repo.contarPadron(procesoId),
      this.repo.contarHistorial(procesoId),
      this.repo.alumnosSinHistorial(procesoId),
    ]);
    const avisos: { nivel: 'info' | 'advertencia'; mensaje: string }[] = [];
    if (estado === 'BORRADOR')
      avisos.push({ nivel: 'info', mensaje: 'El proceso está en borrador: los alumnos aún no pueden votar.' });
    if (!electivos) avisos.push({ nivel: 'advertencia', mensaje: 'No se ha cargado el catálogo de cursos.' });
    if (sinDescripcion) {
      avisos.push({
        nivel: 'advertencia',
        mensaje: `${sinDescripcion} electivo${sinDescripcion === 1 ? '' : 's'} sin descripción.`,
      });
    }
    if (!padron)
      avisos.push({ nivel: 'advertencia', mensaje: 'No se han cargado las cuentas de alumnos para este proceso.' });
    if (!historial)
      avisos.push({ nivel: 'advertencia', mensaje: 'No se ha cargado historial académico para este proceso.' });
    else if (sinHistorial) {
      avisos.push({
        nivel: 'advertencia',
        mensaje: `${sinHistorial} alumno${sinHistorial === 1 ? '' : 's'} del padrón sin historial académico.`,
      });
    }
    return avisos;
  }

  async coordinador(procesoId?: string, aptitud?: Aptitud, filtros: FiltrosResultadosDto = {}) {
    if (filtros.craestMin !== undefined && filtros.craestMax !== undefined && filtros.craestMin > filtros.craestMax)
      throw new BadRequestException('El CRAEst mínimo supera al máximo');
    const proceso = await this.procesos.resolver(procesoId);
    const [indicadores, ranking, avisos] = await Promise.all([
      this.indicadores(proceso.id, filtros, aptitud),
      this.ranking(proceso.id, aptitud, filtros),
      this.avisos(proceso.id, proceso.estado),
    ]);
    const votos = await this.repo.votosDeProceso(proceso.id, aptitud, filtros);
    const poblacion = await this.repo.poblacion(proceso.id, filtros);
    const clasificar = (
      perfil: { ingreso: string | null; craest: unknown; matriculado: boolean | null } | undefined,
    ) => ({
      ingreso: perfil?.ingreso ?? 'Sin datos',
      matricula:
        perfil?.matriculado === null || perfil?.matriculado === undefined
          ? 'Sin datos'
          : perfil.matriculado
            ? 'Matriculado'
            : 'No matriculado',
      craest:
        perfil?.craest === null || perfil?.craest === undefined
          ? 'Sin datos'
          : Number(perfil.craest) < 50
            ? 'Menor de 50'
            : Number(perfil.craest) < 60
              ? '50 a menos de 60'
              : '60 o más',
    });
    const tamanos = new Map<string, number>();
    for (const perfil of poblacion)
      for (const [campo, valor] of Object.entries(clasificar(perfil))) {
        const grupo = `${campo}: ${valor}`;
        tamanos.set(grupo, (tamanos.get(grupo) ?? 0) + 1);
      }
    const grupos = new Map<
      string,
      { codigo: string; grupo: string; votos: number; alumnos: Set<string>; poblacion: number }
    >();
    for (const v of votos)
      for (const [campo, valor] of Object.entries(clasificar(v.usuario.padron[0]))) {
        if (filtros.grupo && filtros.grupo !== campo) continue;
        const nombre = `${campo}: ${valor}`;
        const clave = `${v.cursoCodigo}-${nombre}`;
        const grupo = grupos.get(clave) ?? {
          codigo: v.cursoCodigo,
          grupo: nombre,
          votos: 0,
          alumnos: new Set<string>(),
          poblacion: tamanos.get(nombre) ?? 0,
        };
        grupo.votos++;
        grupo.alumnos.add(v.usuarioId);
        grupos.set(clave, grupo);
      }
    return {
      proceso,
      indicadores,
      ranking,
      avisos,
      filtroAptitud: aptitud ?? null,
      filtros,
      agrupaciones: [...grupos.values()].map((g) => ({
        codigo: g.codigo,
        grupo: g.grupo,
        votos: g.votos,
        alumnos: g.alumnos.size,
        poblacion: g.poblacion,
      })),
    };
  }

  async detalleCurso(codigo: string, procesoId?: string) {
    const proceso = await this.procesos.resolver(procesoId);
    const curso = await this.repo.curso(codigo.toUpperCase());
    if (!curso) throw new NotFoundException('Curso no encontrado');
    const votos = await this.repo.votosDeCurso(proceso.id, curso.codigo);
    const franjas = conteoFranjasVacio();
    let confirmados = 0;
    let condicionales = 0;
    for (const v of votos) {
      if (v.aptitud === 'CONFIRMADO') confirmados++;
      else if (v.aptitud === 'CONDICIONAL') condicionales++;
      for (const { franja } of v.franjas) franjas[franja]++;
    }
    return {
      proceso: { id: proceso.id, nombre: proceso.nombre, estado: proceso.estado },
      curso: {
        codigo: curso.codigo,
        nombre: curso.nombre,
        creditos: Number(curso.creditos),
        tipo: curso.tipo,
        requisitosTexto: curso.requisitosTexto,
        descripcion: curso.descripcion,
      },
      total: votos.length,
      confirmados,
      condicionales,
      franjas,
      votantes: [],
    };
  }
}
