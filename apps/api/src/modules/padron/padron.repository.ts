import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PadronRepository {
  constructor(private readonly prisma: PrismaService) {}

  alumnosDelProceso(procesoId: string) {
    return this.prisma.padronAlumno.findMany({
      where: { procesoId },
      select: {
        usuario: {
          select: {
            id: true,
            codigo: true,
            nombres: true,
            apellidos: true,
            correo: true,
            _count: { select: { votos: { where: { procesoId } }, historial: { where: { procesoId } } } },
          },
        },
      },
      orderBy: { usuario: { apellidos: 'asc' } },
    });
  }

  alumnoEnProceso(procesoId: string, codigo: string) {
    return this.prisma.usuario.findFirst({
      where: { codigo, rol: 'ALUMNO', padron: { some: { procesoId } } },
      select: { id: true, codigo: true, nombres: true, apellidos: true, correo: true },
    });
  }

  votosDeAlumno(procesoId: string, usuarioId: string) {
    return this.prisma.voto.findMany({
      where: { procesoId, usuarioId },
      include: { franjas: { select: { franja: true } }, curso: { select: { nombre: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }
}
