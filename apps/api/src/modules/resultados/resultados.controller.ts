import { FiltrosResultadosDto } from './filtros.dto';
import { Controller, Get, Param, ParseEnumPipe, ParseUUIDPipe, Query } from '@nestjs/common';
import { Aptitud } from '@prisma/client';
import { Roles } from '../../common/auth.decorators';
import { ResultadosService } from './resultados.service';

@Controller('resultados')
export class ResultadosPublicosController {
  constructor(private readonly resultados: ResultadosService) {}

  /** Ranking y franjas, sin nombres de votantes. */
  @Roles('ALUMNO', 'COORDINADOR')
  @Get('publicos')
  publicos() {
    return this.resultados.publicos();
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
    @Query('aptitud', new ParseEnumPipe(Aptitud, { optional: true })) aptitud?: Aptitud,
  ) {
    return this.resultados.coordinador(procesoId, aptitud, filtros);
  }

  @Get(':codigo')
  detalle(
    @Param('codigo') codigo: string,
    @Query('procesoId', new ParseUUIDPipe({ optional: true })) procesoId?: string,
  ) {
    return this.resultados.detalleCurso(codigo, procesoId);
  }
}
