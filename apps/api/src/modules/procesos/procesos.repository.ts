import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { EstadoProceso, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProcesosRepository {
  constructor(private readonly prisma: PrismaService) {}

  async tieneSeguimiento(procesoId: string) {
    return (await this.prisma.seguimientoCurso.count({ where: { procesoId } })) > 0;
  }

  reutilizarCatalogo(id: string, origenId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "ProcesoVotacion" WHERE id = ${id} FOR UPDATE`;
      const destino = await tx.procesoVotacion.findUniqueOrThrow({ where: { id } });
      const origen = await tx.procesoVotacion.findUniqueOrThrow({ where: { id: origenId } });
      if (id === origenId || destino.primeraApertura || destino.estado !== 'BORRADOR')
        throw new BadRequestException('Solo se puede reutilizar en un borrador sin apertura previa');
      if (!Array.isArray(origen.catalogo) || !origen.catalogo.length)
        throw new BadRequestException('El proceso de origen aún no tiene catálogo congelado');
      return tx.procesoVotacion.update({ where: { id }, data: { catalogo: origen.catalogo } });
    });
  }

  abrir(id: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(6152701)`;
      await tx.$queryRaw`SELECT 1 FROM "ProcesoVotacion" WHERE id = ${id} FOR UPDATE`;
      const actual = await tx.procesoVotacion.findUniqueOrThrow({ where: { id } });
      if (actual.fechaFin <= new Date()) throw new BadRequestException('Extiende la fecha de fin antes de abrir');
      if (await tx.procesoVotacion.count({ where: { estado: 'ABIERTO', id: { not: id } } }))
        throw new ConflictException('Ya hay otro proceso abierto');
      if (await tx.seguimientoCurso.count({ where: { procesoId: id } }))
        throw new BadRequestException('No se puede reabrir un proceso con seguimiento del consejo');
      const cursos =
        actual.catalogo ??
        JSON.parse(
          JSON.stringify(
            await tx.curso.findMany({
              where: { activo: true },
              include: { requisitos: { orderBy: { orden: 'asc' } } },
            }),
          ),
        );
      return tx.procesoVotacion.update({
        where: { id },
        data: { estado: 'ABIERTO', primeraApertura: actual.primeraApertura ?? new Date(), catalogo: cursos },
      });
    });
  }

  listar() {
    return this.prisma.procesoVotacion.findMany({
      orderBy: [{ fechaInicio: 'desc' }, { createdAt: 'desc' }],
      include: { _count: { select: { padron: true, votos: true } } },
    });
  }

  buscar(id: string) {
    return this.prisma.procesoVotacion.findUnique({ where: { id } });
  }

  buscarAbierto() {
    return this.prisma.procesoVotacion.findFirst({ where: { estado: 'ABIERTO' } });
  }

  buscarUltimo() {
    return this.prisma.procesoVotacion.findFirst({ orderBy: [{ fechaInicio: 'desc' }, { createdAt: 'desc' }] });
  }

  crear(data: Prisma.ProcesoVotacionCreateInput) {
    return this.prisma.procesoVotacion.create({ data });
  }

  actualizar(id: string, data: Prisma.ProcesoVotacionUpdateInput) {
    return this.prisma.procesoVotacion.update({ where: { id }, data });
  }

  /** Cierra los procesos abiertos cuya fecha de fin ya pasó. Devuelve los ids cerrados. */
  async cerrarVencidos(ahora: Date): Promise<string[]> {
    const vencidos = await this.prisma.procesoVotacion.findMany({
      where: { estado: 'ABIERTO', fechaFin: { lte: ahora } },
      select: { id: true },
    });
    if (!vencidos.length) return [];
    const ids = vencidos.map((p) => p.id);
    await this.prisma.procesoVotacion.updateMany({
      where: { id: { in: ids }, estado: 'ABIERTO' },
      data: { estado: EstadoProceso.CERRADO },
    });
    return ids;
  }

  async estaEnPadron(procesoId: string, usuarioId: string) {
    const fila = await this.prisma.padronAlumno.findUnique({
      where: { procesoId_usuarioId: { procesoId, usuarioId } },
    });
    return !!fila;
  }
}
