import { SeguimientoModule } from './modules/seguimiento/seguimiento.module';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard, RolesGuard } from './common/auth.guards';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogoModule } from './modules/catalogo/catalogo.module';
import { ExportModule } from './modules/export/export.module';
import { ImportacionModule } from './modules/importacion/importacion.module';
import { PadronModule } from './modules/padron/padron.module';
import { ProcesosModule } from './modules/procesos/procesos.module';
import { RealtimeModule } from './modules/resultados/realtime.module';
import { ResultadosModule } from './modules/resultados/resultados.module';
import { VotosModule } from './modules/votos/votos.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    RealtimeModule,
    AuthModule,
    ProcesosModule,
    CatalogoModule,
    PadronModule,
    VotosModule,
    ResultadosModule,
    ImportacionModule,
    ExportModule,
    SeguimientoModule,
  ],
  providers: [
    // Orden: primero autenticación (coloca req.usuario), luego roles.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
