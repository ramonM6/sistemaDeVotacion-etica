import { FiltrosResultadosDto } from './filtros.dto';
import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Aptitud } from '@prisma/client';
import { Roles, UsuarioActual, UsuarioSesion } from '../../common/auth.decorators';
import { ResultadosService } from './resultados.service';

@Controller('resultados')
export class ResultadosPublicosController {
  constructor(private readonly resultados: ResultadosService) {}

  /** Ranking y franjas, sin nombres de votantes. */
  @Roles('ALUMNO', 'COORDINADOR')
  @Get('publicos')
  publicos(@UsuarioActual() u: UsuarioSesion, @Query('procesoId', new ParseUUIDPipe({ optional: true })) id?: string) {
    return this.resultados.publicos(id, u.rol === 'ALUMNO' ? u.id : undefined);
  }
}

@Roles('COORDINADOR')
@Controller('coord/resultados')
export class CoordResultadosController {
  constructor(private readonly resultados: ResultadosService) {}

  @Get()
  resultadosCoord(
    @Query() filtros: FiltrosResultadosDto,
    @Query('procesoId', new ParseUUIDPipe({ optional: true })) procesoId?: string,
  ) {
    return this.resultados.coordinador(procesoId, filtros.aptitud as Aptitud | undefined);
  }

  @Get(':codigo')
  detalle(
    @Param('codigo') codigo: string,
    @Query('procesoId', new ParseUUIDPipe({ optional: true })) procesoId?: string,
  ) {
    return this.resultados.detalleCurso(codigo, procesoId);
  }
}
