import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsUUID } from 'class-validator';
import { Response } from 'express';
import { createReadStream } from 'fs';
import { memoryStorage } from 'multer';
import { Roles, UsuarioActual, UsuarioSesion } from '../../common/auth.decorators';
import { ImportacionService, TIPOS_IMPORTACION, TipoImportacion } from './importacion.service';

export const MAX_BYTES = 5 * 1024 * 1024;
const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

class ConfirmarDto {
  @IsUUID()
  token: string;
}

function validarTipo(tipo: string): TipoImportacion {
  if (!TIPOS_IMPORTACION.includes(tipo as TipoImportacion)) {
    throw new BadRequestException(`Tipo de importación inválido: use ${TIPOS_IMPORTACION.join(', ')}`);
  }
  return tipo as TipoImportacion;
}

@Roles('COORDINADOR')
@Controller('coord/import')
export class ImportacionController {
  constructor(private readonly importacion: ImportacionService) {}

  @Get('alumnos')
  alumnos() {
    return this.importacion.listarAlumnos();
  }

  @Get('archivos')
  archivos(@Query('procesoId', new ParseUUIDPipe({ optional: true })) id?: string) {
    return this.importacion.listarArchivos(id);
  }

  @Get('archivos/:id')
  async descargar(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const { nombre, buffer } = await this.importacion.descargarArchivo(id);
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`,
    });
    return new StreamableFile(buffer);
  }

  @Delete(':tipo')
  eliminar(
    @Param('tipo') tipo: string,
    @Query('procesoId', ParseUUIDPipe) id: string,
    @UsuarioActual() u: UsuarioSesion,
  ) {
    return this.importacion.eliminar(tipo, id, u.id);
  }

  /** Sube un .xlsx (máx. 5 MB, procesado en memoria) y devuelve filas, errores y advertencias. */
  @Post(':tipo/preview')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('archivo', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_BYTES, files: 1 },
      fileFilter: (_req, file, cb) => {
        const esXlsx = /\.(xlsx|csv)$/i.test(file.originalname);
        const mimeOk = [
          MIME_XLSX,
          'application/octet-stream',
          'application/zip',
          'text/csv',
          ...(file.originalname.toLowerCase().endsWith('.csv') ? ['text/plain'] : []),
          'application/vnd.ms-excel',
        ].includes(file.mimetype);
        if (!esXlsx || !mimeOk) return cb(new BadRequestException('Solo se aceptan archivos .xlsx o .csv'), false);
        cb(null, true);
      },
    }),
  )
  preview(
    @Param('tipo') tipo: string,
    @UploadedFile() archivo: Express.Multer.File | undefined,
    @UsuarioActual() u: UsuarioSesion,
    @Query('procesoId', new ParseUUIDPipe({ optional: true })) procesoId?: string,
  ) {
    const t = validarTipo(tipo);
    if (!archivo?.buffer?.length)
      throw new BadRequestException('Adjunta un archivo .xlsx o .csv en el campo "archivo"');
    return this.importacion.preview(t, archivo.buffer, u.id, procesoId, archivo.originalname);
  }

  @Post(':tipo/confirmar')
  @HttpCode(200)
  confirmar(@Param('tipo') tipo: string, @Body() dto: ConfirmarDto, @UsuarioActual() u: UsuarioSesion) {
    return this.importacion.confirmar(validarTipo(tipo), dto.token, u.id);
  }

  @Get(':tipo/ejemplo')
  ejemplo(@Param('tipo') tipo: string, @Res({ passthrough: true }) res: Response) {
    const { ruta, nombre } = this.importacion.rutaEjemplo(validarTipo(tipo));
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${nombre}"` });
    return new StreamableFile(createReadStream(ruta));
  }

  @Get(':tipo/plantilla')
  plantilla(@Param('tipo') tipo: string, @Res({ passthrough: true }) res: Response) {
    const { ruta, nombre } = this.importacion.rutaPlantilla(validarTipo(tipo));
    res.set({ 'Content-Type': MIME_XLSX, 'Content-Disposition': `attachment; filename="${nombre}"` });
    return new StreamableFile(createReadStream(ruta));
  }
}
