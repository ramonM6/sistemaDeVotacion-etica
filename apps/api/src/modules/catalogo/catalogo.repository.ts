import { Injectable } from '@nestjs/common';
import { Prisma, TipoCurso } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TerminoRequisito } from '../elegibilidad/motor';

@Injectable()
export class CatalogoRepository {
  constructor(private readonly prisma: PrismaService) {}

  listar(tipo?: TipoCurso) {
    return this.prisma.curso.findMany({
      where: { activo: true, ...(tipo ? { tipo } : {}) },
      orderBy: [{ ciclo: { sort: 'asc', nulls: 'last' } }, { codigo: 'asc' }],
      include: { requisitos: { orderBy: { orden: 'asc' } } },
    });
  }

  buscar(codigo: string) {
    return this.prisma.curso.findUnique({ where: { codigo }, include: { requisitos: { orderBy: { orden: 'asc' } } } });
  }

  async actualizar(codigo: string, data: Prisma.CursoUpdateInput, terminos?: TerminoRequisito[]) {
    return this.prisma.$transaction(async (tx) => {
      await tx.curso.update({ where: { codigo }, data });
      if (terminos) {
        await tx.requisito.deleteMany({ where: { cursoCodigo: codigo } });
        if (terminos.length) {
          await tx.requisito.createMany({
            data: terminos.map((t, orden) => ({
              cursoCodigo: codigo,
              orden,
              texto: t.texto,
              tipo: t.tipo,
              cursoRequerido: t.cursoRequerido ?? null,
              creditosMinimos: t.creditosMinimos ?? null,
            })),
          });
        }
      }
      return tx.curso.findUniqueOrThrow({ where: { codigo }, include: { requisitos: { orderBy: { orden: 'asc' } } } });
    });
  }
}
