import { Injectable } from '@nestjs/common';
import { Aptitud, Franja, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type Tx = Prisma.TransactionClient;

@Injectable()
export class VotosRepository {
  constructor(private readonly prisma: PrismaService) {}

  async intereses(procesoId: string, usuarioId: string) {
    const padron = await this.prisma.padronAlumno.findUniqueOrThrow({
      where: { procesoId_usuarioId: { procesoId, usuarioId } },
    });
    return padron.intereses;
  }

  async marcarInteres(procesoId: string, usuarioId: string, codigo: string, interesado: boolean) {
    return this.transaccion(async (tx) => {
      if (!(await this.bloquearPadron(tx, procesoId, usuarioId))) return [];
      const padron = await tx.padronAlumno.findUniqueOrThrow({
        where: { procesoId_usuarioId: { procesoId, usuarioId } },
      });
      const intereses = interesado
        ? [...new Set([...padron.intereses, codigo])]
        : padron.intereses.filter((c) => c !== codigo);
      await tx.padronAlumno.update({ where: { procesoId_usuarioId: { procesoId, usuarioId } }, data: { intereses } });
      return intereses;
    });
  }

  transaccion<T>(fn: (tx: Tx) => Promise<T>) {
    return this.prisma.$transaction(fn, { timeout: 15_000 });
  }

  /**
   * Bloquea la fila del padrón del alumno hasta el fin de la transacción, de modo que dos votos
   * simultáneos del mismo alumno se serializan (evita superar maxCursos por condición de carrera).
   * Devuelve false si el alumno no está en el padrón.
   */
  async bloquearPadron(tx: Tx, procesoId: string, usuarioId: string): Promise<boolean> {
    const filas = await tx.$queryRaw<unknown[]>`
      SELECT 1 FROM "PadronAlumno" WHERE "procesoId" = ${procesoId} AND "usuarioId" = ${usuarioId} FOR UPDATE`;
    return filas.length > 0;
  }

  aceptacion(procesoId: string, usuarioId: string, db: Tx | PrismaService = this.prisma) {
    return db.aceptacionTerminos.findUnique({ where: { procesoId_usuarioId: { procesoId, usuarioId } } });
  }

  guardarAceptacion(procesoId: string, usuarioId: string, version: number) {
    return this.prisma.aceptacionTerminos.upsert({
      where: { procesoId_usuarioId: { procesoId, usuarioId } },
      create: { procesoId, usuarioId, version },
      update: { version, aceptadoEn: new Date() },
    });
  }

  contarVotos(procesoId: string, usuarioId: string, db: Tx | PrismaService = this.prisma) {
    return db.voto.count({ where: { procesoId, usuarioId } });
  }

  crearVoto(
    tx: Tx,
    data: { procesoId: string; usuarioId: string; cursoCodigo: string; aptitud: Aptitud; franjas: Franja[] },
  ) {
    return tx.voto.create({
      data: {
        procesoId: data.procesoId,
        usuarioId: data.usuarioId,
        cursoCodigo: data.cursoCodigo,
        aptitud: data.aptitud,
        franjas: { create: data.franjas.map((franja) => ({ franja })) },
      },
      include: { franjas: true, curso: { select: { nombre: true, creditos: true } } },
    });
  }

  votosDeAlumno(procesoId: string, usuarioId: string) {
    return this.prisma.voto.findMany({
      where: { procesoId, usuarioId },
      include: { franjas: true, curso: { select: { nombre: true, creditos: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }
}
