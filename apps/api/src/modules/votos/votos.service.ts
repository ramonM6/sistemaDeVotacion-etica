import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Franja, Prisma, ProcesoVotacion } from '@prisma/client';
import { FRANJAS } from '../../common/franjas';
import { AuditService } from '../audit/audit.service';
import { ElegibilidadService } from '../elegibilidad/elegibilidad.service';
import { ProcesosService } from '../procesos/procesos.service';
import { ResultadosGateway } from '../resultados/resultados.gateway';
import { EmitirVotoDto } from './votos.dto';
import { VotosRepository } from './votos.repository';

const ordenFranja = (f: Franja) => FRANJAS.findIndex((x) => x.valor === f);

/** Un proceso admite votos si está ABIERTO y aún no llegó su fecha de fin. */
const estaAbierto = (p: ProcesoVotacion) =>
  p.estado === 'ABIERTO' && p.fechaInicio <= new Date() && p.fechaFin > new Date();

@Injectable()
export class VotosService {
  constructor(
    private readonly repo: VotosRepository,
    private readonly procesos: ProcesosService,
    private readonly elegibilidad: ElegibilidadService,
    private readonly audit: AuditService,
    private readonly gateway: ResultadosGateway,
  ) {}

  /** Proceso activo en el que el alumno está empadronado. */
  private async procesoDelAlumno(usuarioId: string, procesoId?: string) {
    const proceso = await this.procesos.resolver(procesoId);
    if (proceso.estado === 'BORRADOR' || !(await this.procesos.estaEnPadron(proceso.id, usuarioId))) {
      throw new ForbiddenException('No estás habilitado en el proceso de votación actual');
    }
    return proceso;
  }

  listarProcesos(usuarioId: string) {
    return this.procesos.listarDelAlumno(usuarioId);
  }

  async estado(usuarioId: string, procesoId?: string) {
    const proceso = await this.procesoDelAlumno(usuarioId, procesoId);
    const votosUsados = await this.repo.contarVotos(proceso.id, usuarioId);
    const abierto = estaAbierto(proceso);
    return {
      proceso,
      abierto,
      votosUsados,
      maxCursos: Math.min(5, proceso.maxCursos),
      maxFranjas: proceso.maxFranjas,
      puedeVotar: abierto && votosUsados < Math.min(5, proceso.maxCursos),
    };
  }

  async electivos(usuarioId: string, procesoId?: string) {
    const proceso = await this.procesoDelAlumno(usuarioId, procesoId);
    const [evaluacion, votos] = await Promise.all([
      this.elegibilidad.evaluarAlumno(proceso.id, usuarioId),
      this.repo.votosDeAlumno(proceso.id, usuarioId),
    ]);
    const votoPorCurso = new Map(votos.map((v) => [v.cursoCodigo, v]));
    return {
      creditos: evaluacion.creditos,
      electivos: evaluacion.electivos.map((e) => {
        const voto = votoPorCurso.get(e.codigo);
        return {
          ...e,
          voto: voto
            ? { franjas: this.franjasOrdenadas(voto.franjas), aptitud: voto.aptitud, createdAt: voto.createdAt }
            : null,
        };
      }),
    };
  }

  async electivo(usuarioId: string, codigo: string, procesoId?: string) {
    const { electivos, creditos } = await this.electivos(usuarioId, procesoId);
    const electivo = electivos.find((e) => e.codigo === codigo.toUpperCase());
    if (!electivo) throw new NotFoundException('Electivo no encontrado');
    return { ...electivo, creditosAlumno: creditos };
  }

  async misVotos(usuarioId: string, procesoId?: string) {
    const proceso = await this.procesoDelAlumno(usuarioId, procesoId);
    const votos = await this.repo.votosDeAlumno(proceso.id, usuarioId);
    return votos.map((v) => ({
      id: v.id,
      cursoCodigo: v.cursoCodigo,
      cursoNombre: v.curso.nombre,
      creditos: Number(v.curso.creditos),
      aptitud: v.aptitud,
      franjas: this.franjasOrdenadas(v.franjas),
      createdAt: v.createdAt,
    }));
  }

  /**
   * Emite un voto (curso + franjas) en una sola operación atómica. Se revalida todo dentro de la
   * transacción: proceso abierto, padrón, límite de votos, franjas y aptitud.
   * Incluye las dependencias electivas simultáneas dentro del mismo límite de cursos.
   */
  async emitir(usuarioId: string, dto: EmitirVotoDto, procesoId?: string) {
    const procesoActivo = await this.procesoDelAlumno(usuarioId, procesoId);
    const cursoCodigo = dto.cursoCodigo.toUpperCase();
    const franjas = [...dto.franjas].sort((a, b) => ordenFranja(a) - ordenFranja(b));

    try {
      const voto = await this.repo.transaccion(async (tx) => {
        if (!(await this.repo.bloquearPadron(tx, procesoActivo.id, usuarioId))) {
          throw new ForbiddenException('No estás habilitado en el proceso de votación actual');
        }
        await tx.$queryRaw`SELECT 1 FROM "ProcesoVotacion" WHERE id = ${procesoActivo.id} FOR SHARE`;
        const proceso = await tx.procesoVotacion.findUniqueOrThrow({ where: { id: procesoActivo.id } });
        if (!estaAbierto(proceso)) throw new BadRequestException('El proceso de votación no está abierto');

        if (franjas.length < 1) throw new BadRequestException('Debes elegir al menos una franja');
        if (franjas.length > Math.min(2, proceso.maxFranjas)) {
          throw new BadRequestException(`Puedes elegir como máximo ${proceso.maxFranjas} franjas por curso`);
        }
        if (new Set(franjas).size !== franjas.length) throw new BadRequestException('Las franjas no pueden repetirse');

        const usados = await this.repo.contarVotos(proceso.id, usuarioId, tx);
        if (usados >= Math.min(5, proceso.maxCursos)) {
          throw new BadRequestException(`Ya usaste tus ${proceso.maxCursos} votos`);
        }

        const plan = await this.elegibilidad.planEleccion(proceso.id, usuarioId, cursoCodigo, tx);
        if (plan.some((e) => e.elegibilidad.aptitud === 'NO_APTO'))
          throw new ForbiddenException('No cumples los requisitos de este electivo o sus dependencias');
        const existentes = await tx.voto.findMany({
          where: { procesoId: proceso.id, usuarioId },
          select: { cursoCodigo: true },
        });
        const elegidos = new Set(existentes.map((v) => v.cursoCodigo));
        if (elegidos.has(cursoCodigo)) throw new ConflictException('Ya votaste por este curso');
        const nuevos = plan.filter((e) => !elegidos.has(e.codigo));
        if (usados + nuevos.length > Math.min(5, proceso.maxCursos))
          throw new BadRequestException('El curso y sus dependencias exceden el máximo de 5 electivos');
        let principal: Awaited<ReturnType<VotosRepository['crearVoto']>> | undefined;
        for (const electivo of nuevos) {
          const creado = await this.repo.crearVoto(tx, {
            procesoId: proceso.id,
            usuarioId,
            cursoCodigo: electivo.codigo,
            aptitud: electivo.elegibilidad.aptitud,
            franjas,
          });
          if (electivo.codigo === cursoCodigo) principal = creado;
        }
        return principal!;
      });

      await this.audit.registrar('VOTO', usuarioId, {
        procesoId: voto.procesoId,
        cursoCodigo,
        franjas,
        aptitud: voto.aptitud,
      });
      this.gateway.notificar('voto', voto.procesoId);

      return {
        id: voto.id,
        cursoCodigo: voto.cursoCodigo,
        cursoNombre: voto.curso.nombre,
        creditos: Number(voto.curso.creditos),
        aptitud: voto.aptitud,
        franjas: this.franjasOrdenadas(voto.franjas),
        createdAt: voto.createdAt,
      };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya votaste por este curso');
      }
      throw e;
    }
  }

  async emitirLote(usuarioId: string, votos: EmitirVotoDto[], procesoId: string) {
    const elegido = await this.procesoDelAlumno(usuarioId, procesoId);
    await this.repo.transaccion(async (tx) => {
      if (!(await this.repo.bloquearPadron(tx, elegido.id, usuarioId)))
        throw new ForbiddenException('No estás habilitado en esta votación');
      await tx.$queryRaw`SELECT 1 FROM "ProcesoVotacion" WHERE id = ${elegido.id} FOR SHARE`;
      const proceso = await tx.procesoVotacion.findUniqueOrThrow({ where: { id: elegido.id } });
      if (!estaAbierto(proceso)) throw new BadRequestException('La votación no está abierta');
      const existentes = await tx.voto.findMany({
        where: { procesoId: proceso.id, usuarioId },
        select: { cursoCodigo: true },
      });
      const elegidos = new Set(existentes.map((v) => v.cursoCodigo));
      const nuevos = new Map<string, { aptitud: 'CONFIRMADO' | 'CONDICIONAL'; franjas: Franja[] }>();
      const explicitos = new Map(votos.map((v) => [v.cursoCodigo, v.franjas]));
      if (explicitos.size !== votos.length) throw new BadRequestException('No repitas cursos en la selección');
      for (const voto of votos) {
        if (elegidos.has(voto.cursoCodigo)) throw new ConflictException(`Ya votaste por ${voto.cursoCodigo}`);
        if (!voto.franjas.length || voto.franjas.length > Math.min(2, proceso.maxFranjas))
          throw new BadRequestException('Selecciona de 1 a 2 franjas por curso');
        const plan = await this.elegibilidad.planEleccion(proceso.id, usuarioId, voto.cursoCodigo, tx);
        for (const curso of plan) {
          if (curso.elegibilidad.aptitud === 'NO_APTO')
            throw new ForbiddenException(`No cumples los requisitos de ${curso.codigo}`);
          if (!elegidos.has(curso.codigo) && !nuevos.has(curso.codigo))
            nuevos.set(curso.codigo, {
              aptitud: curso.elegibilidad.aptitud,
              franjas: explicitos.get(curso.codigo) ?? voto.franjas,
            });
        }
      }
      if (elegidos.size + nuevos.size > Math.min(5, proceso.maxCursos))
        throw new BadRequestException('Los cursos y sus dependencias exceden el máximo de 5 electivos');
      for (const [cursoCodigo, datos] of nuevos)
        await this.repo.crearVoto(tx, { procesoId: proceso.id, usuarioId, cursoCodigo, ...datos });
    });
    await this.audit.registrar('VOTO', usuarioId, { procesoId, cursos: votos.map((v) => v.cursoCodigo) });
    this.gateway.notificar('voto', procesoId);
    return this.misVotos(usuarioId, procesoId);
  }

  async cambiar(usuarioId: string, codigo: string, dto?: EmitirVotoDto, procesoId?: string) {
    const activo = await this.procesoDelAlumno(usuarioId, procesoId);
    const resultado = await this.repo.transaccion(async (tx) => {
      if (!(await this.repo.bloquearPadron(tx, activo.id, usuarioId))) {
        throw new ForbiddenException('No estás habilitado en este proceso');
      }
      // Serializa también con cierre/reapertura del proceso.
      await tx.$queryRaw`SELECT 1 FROM "ProcesoVotacion" WHERE id = ${activo.id} FOR SHARE`;
      const proceso = await tx.procesoVotacion.findUniqueOrThrow({ where: { id: activo.id } });
      if (!estaAbierto(proceso)) throw new BadRequestException('La votación no está abierta');
      const voto = await tx.voto.findUnique({
        where: {
          procesoId_usuarioId_cursoCodigo: { procesoId: proceso.id, usuarioId, cursoCodigo: codigo.toUpperCase() },
        },
      });
      if (!voto) throw new NotFoundException('No has votado por este curso');
      if (!dto) {
        const actuales = await tx.voto.findMany({ where: { procesoId: proceso.id, usuarioId } });
        const retirar = new Set([voto.cursoCodigo]);
        let cambio = true;
        while (cambio) {
          cambio = false;
          for (const v of actuales) {
            if (retirar.has(v.cursoCodigo)) continue;
            const plan = await this.elegibilidad.planEleccion(proceso.id, usuarioId, v.cursoCodigo, tx);
            if (plan.some((e) => retirar.has(e.codigo))) {
              retirar.add(v.cursoCodigo);
              cambio = true;
            }
          }
        }
        return tx.voto.deleteMany({ where: { procesoId: proceso.id, usuarioId, cursoCodigo: { in: [...retirar] } } });
      }
      if (!dto.franjas.length || dto.franjas.length > Math.min(2, proceso.maxFranjas)) {
        throw new BadRequestException('Selecciona de 1 a 2 franjas');
      }
      const plan = await this.elegibilidad.planEleccion(proceso.id, usuarioId, voto.cursoCodigo, tx);
      const electivo = plan[0];
      if (plan.some((e) => e.elegibilidad.aptitud === 'NO_APTO'))
        throw new ForbiddenException('No cumples los requisitos');
      return tx.voto.update({
        where: { id: voto.id },
        data: {
          aptitud: electivo.elegibilidad.aptitud,
          franjas: { deleteMany: {}, create: dto.franjas.map((franja) => ({ franja })) },
        },
      });
    });
    await this.audit.registrar(dto ? 'EDITAR_VOTO' : 'RETIRAR_VOTO', usuarioId, {
      procesoId: activo.id,
      cursoCodigo: codigo,
    });
    this.gateway.notificar('voto', activo.id);
    return resultado;
  }

  private franjasOrdenadas(franjas: { franja: Franja }[]): Franja[] {
    return franjas.map((f) => f.franja).sort((a, b) => ordenFranja(a) - ordenFranja(b));
  }
}
