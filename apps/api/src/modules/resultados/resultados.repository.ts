import { FiltrosResultadosDto, filtroPadron } from './filtros.dto';
import { Injectable } from '@nestjs/common';
import { Aptitud } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ResultadosRepository {
  constructor(private readonly prisma: PrismaService) {}

  votosDeProceso(procesoId: string, aptitud?: Aptitud, filtros: FiltrosResultadosDto = {}) {
    return this.prisma.voto.findMany({
      where: {
        procesoId,
        ...(aptitud ? { aptitud } : {}),
        usuario: { padron: { some: filtroPadron(procesoId, filtros) } },
      },
      select: {
        cursoCodigo: true,
        aptitud: true,
        usuarioId: true,
        usuario: {
          select: { padron: { where: { procesoId }, select: { ingreso: true, craest: true, matriculado: true } } },
        },
        franjas: { select: { franja: true } },
        curso: { select: { nombre: true, creditos: true } },
      },
    });
  }

  votosDeCurso(procesoId: string, cursoCodigo: string) {
    return this.prisma.voto.findMany({
      where: { procesoId, cursoCodigo },
      select: { aptitud: true, franjas: { select: { franja: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  seguimiento(procesoId: string) {
    return this.prisma.seguimientoCurso.findMany({ where: { procesoId } });
  }

  poblacion(procesoId: string, filtros: FiltrosResultadosDto) {
    return this.prisma.padronAlumno.findMany({
      where: filtroPadron(procesoId, filtros),
      select: { ingreso: true, craest: true, matriculado: true },
    });
  }

  curso(codigo: string) {
    return this.prisma.curso.findUnique({ where: { codigo } });
  }

  contarPadron(procesoId: string, filtros: FiltrosResultadosDto = {}) {
    return this.prisma.padronAlumno.count({ where: filtroPadron(procesoId, filtros) });
  }

  contarHistorial(procesoId: string) {
    return this.prisma.historialItem.count({ where: { procesoId } });
  }

  async alumnosSinHistorial(procesoId: string) {
    return this.prisma.padronAlumno.count({
      where: { procesoId, usuario: { historial: { none: { procesoId } } } },
    });
  }

  contarElectivos() {
    return this.prisma.curso.count({ where: { tipo: 'ELECTIVO', activo: true } });
  }

  contarElectivosSinDescripcion() {
    return this.prisma.curso.count({
      where: { tipo: 'ELECTIVO', activo: true, OR: [{ descripcion: null }, { descripcion: '' }] },
    });
  }
}
