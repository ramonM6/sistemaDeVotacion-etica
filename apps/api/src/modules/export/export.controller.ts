import { Aptitud } from '@prisma/client';
import { FiltrosResultadosDto } from '../resultados/filtros.dto';
import { Controller, Get, Param, ParseUUIDPipe, Query, Res, StreamableFile } from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../../common/auth.decorators';
import { ExportService } from './export.service';

const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@Roles('COORDINADOR')
@Controller('coord/export')
export class ExportController {
  constructor(private readonly exportar: ExportService) {}

  /** Hojas agregadas: Ranking y Matriz franjas. */
  @Get('resultados.xlsx')
  async resultados(@Res({ passthrough: true }) res: Response, @Query() filtros: FiltrosResultadosDto) {
    const { buffer, nombre } = await this.exportar.resultadosXlsx(
      filtros.procesoId,
      filtros.aptitud as Aptitud | undefined,
    );
    res.set({ 'Content-Type': MIME_XLSX, 'Content-Disposition': `attachment; filename="${nombre}"` });
    return new StreamableFile(buffer);
  }

  /** Resumen agregado de un curso; nunca incluye elecciones identificadas. */
  @Get('cursos/:codigo/votantes.xlsx')
  async curso(
    @Param('codigo') codigo: string,
    @Res({ passthrough: true }) res: Response,
    @Query('procesoId', new ParseUUIDPipe({ optional: true })) procesoId?: string,
  ) {
    const { buffer, nombre } = await this.exportar.cursoXlsx(codigo, procesoId);
    res.set({ 'Content-Type': MIME_XLSX, 'Content-Disposition': `attachment; filename="${nombre}"` });
    return new StreamableFile(buffer);
  }
}
