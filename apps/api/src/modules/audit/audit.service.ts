import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type AccionAudit =
  | 'LOGIN_OK'
  | 'LOGIN_FAIL'
  | 'LOGOUT'
  | 'IMPORT_CATALOGO'
  | 'IMPORT_CUENTAS'
  | 'IMPORT_HISTORIAL'
  | 'CREAR_PROCESO'
  | 'EDITAR_PROCESO'
  | 'CAMBIO_ESTADO_PROCESO'
  | 'EDITAR_CURSO'
  | 'ACEPTAR_TERMINOS'
  | 'VOTO'
  | 'EDITAR_VOTO'
  | 'RETIRAR_VOTO'
  | 'SEGUIMIENTO_CONSEJO';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Registra una acción. Un fallo de auditoría nunca debe romper la operación principal. */
  async registrar(accion: AccionAudit, usuarioId: string | null, detalle?: Prisma.InputJsonValue): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: { accion, usuarioId, detalle } });
    } catch (e) {
      this.logger.error(`No se pudo registrar ${accion}: ${(e as Error).message}`);
    }
  }
}
