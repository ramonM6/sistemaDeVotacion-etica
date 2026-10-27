import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { EstadoProceso, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ProcesosRepository {
  constructor(private readonly prisma: PrismaService) {}

  async tieneSeguimiento(procesoId: string) {
    return (await this.prisma.seguimientoCurso.count({ where: { procesoId } })) > 0;
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
      // Compatibilidad con votaciones antiguas sin copia; los nuevos borradores siempre nacen con [].
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
      if (!Array.isArray(cursos) || !cursos.length)
        throw new BadRequestException('Sube o reutiliza la malla de esta votación antes de abrirla');
      return tx.procesoVotacion.update({
        where: { id },
        data: { estado: 'ABIERTO', primeraApertura: actual.primeraApertura ?? new Date(), catalogo: cursos },
      });
    });
  }

  listarDelAlumno(usuarioId: string) {
    return this.prisma.procesoVotacion.findMany({
      where: { estado: { not: 'BORRADOR' }, padron: { some: { usuarioId } } },
      orderBy: [{ fechaInicio: 'desc' }, { createdAt: 'desc' }],
    });
  }

  listar() {
    return this.prisma.procesoVotacion.findMany({
      orderBy: [{ fechaInicio: 'desc' }, { createdAt: 'desc' }],
      include: { _count: { select: { padron: true, votos: true, historial: true } } },
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

  crear(
    data: Prisma.ProcesoVotacionCreateInput,
    fuentes: { malla?: string; cuentas?: string; historial?: string } = {},
    actorId: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        const ids = [...new Set(Object.values(fuentes).filter((id): id is string => !!id))].sort();
        for (const id of ids) await tx.$queryRaw`SELECT 1 FROM "ProcesoVotacion" WHERE id = ${id} FOR SHARE`;
        const origenes = await tx.procesoVotacion.findMany({ where: { id: { in: ids } } });
        for (const id of ids) {
          const origen = origenes.find((p) => p.id === id);
          if (!origen)
            throw new BadRequestException('Selecciona una votación anterior existente para reutilizar sus archivos');
        }
        const destino = await tx.procesoVotacion.create({ data: { ...data, catalogo: [] } });
        if (fuentes.malla) {
          const malla = origenes.find((p) => p.id === fuentes.malla)!.catalogo;
          if (!Array.isArray(malla) || !malla.length)
            throw new BadRequestException('La votación elegida no tiene malla');
          await tx.procesoVotacion.update({ where: { id: destino.id }, data: { catalogo: malla } });
        }
        if (fuentes.cuentas) {
          const filas = await tx.padronAlumno.findMany({ where: { procesoId: fuentes.cuentas } });
          if (!filas.length) throw new BadRequestException('La votación elegida no tiene cuentas de alumnos');
          await tx.padronAlumno.createMany({
            data: filas.map(({ procesoId: _, ...f }) => ({ ...f, procesoId: destino.id })),
          });
        }
        if (fuentes.historial) {
          const filas = await tx.historialItem.findMany({ where: { procesoId: fuentes.historial } });
          if (!filas.length) throw new BadRequestException('La votación elegida no tiene historial académico');
          const padron = await tx.padronAlumno.findMany({
            where: { procesoId: destino.id },
            select: { usuarioId: true },
          });
          const habilitados = new Set(padron.map((p) => p.usuarioId));
          if (filas.some((f) => !habilitados.has(f.usuarioId)))
            throw new BadRequestException(
              'El historial reutilizado requiere un padrón que incluya a todos sus alumnos. Reutiliza primero las cuentas de la misma votación o sube el historial después.',
            );
          await tx.historialItem.createMany({
            data: filas.map(({ id: _, procesoId: __, ...f }) => ({ ...f, procesoId: destino.id })),
          });
        }
        for (const [tipo, origenId] of Object.entries(fuentes)) {
          if (!origenId) continue;
          const archivo = await tx.archivoCarga.findFirst({
            where: {
              procesoId: origenId,
              tipo: tipo === 'malla' ? { in: ['malla', 'catalogo'] } : tipo,
              bucket: { not: null },
              ruta: { not: null },
            },
            orderBy: { createdAt: 'desc' },
          });
          if (archivo)
            await tx.archivoCarga.create({
              data: {
                procesoId: destino.id,
                actorId,
                tipo,
                nombre: archivo.nombre,
                filas: archivo.filas,
                sha256: archivo.sha256,
                bucket: archivo.bucket,
                ruta: archivo.ruta,
              },
            });
        }
        return tx.procesoVotacion.findUniqueOrThrow({ where: { id: destino.id } });
      },
      { timeout: 60_000 },
    );
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
