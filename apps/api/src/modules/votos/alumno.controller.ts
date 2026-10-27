import { Body, Controller, Delete, Patch, Get, Param, Post, Query, ParseUUIDPipe } from '@nestjs/common';
import { Roles, UsuarioActual, UsuarioSesion } from '../../common/auth.decorators';
import { EmitirVotoDto } from './votos.dto';
import { VotosService } from './votos.service';

/** Endpoints del alumno. Todos operan solo sobre los datos del alumno de la sesión. */
@Roles('ALUMNO')
@Controller('alumno')
export class AlumnoController {
  constructor(private readonly votos: VotosService) {}

  @Get('procesos')
  procesos(@UsuarioActual() u: UsuarioSesion) {
    return this.votos.listarProcesos(u.id);
  }

  @Get('estado')
  estado(
    @UsuarioActual() u: UsuarioSesion,
    @Query('procesoId', new ParseUUIDPipe({ optional: true })) procesoId?: string,
  ) {
    return this.votos.estado(u.id, procesoId);
  }

  @Post('terminos')
  aceptarTerminos(
    @UsuarioActual() u: UsuarioSesion,
    @Query('procesoId', new ParseUUIDPipe({ optional: true })) procesoId?: string,
  ) {
    return this.votos.aceptarTerminos(u.id, procesoId);
  }

  @Get('electivos')
  electivos(
    @UsuarioActual() u: UsuarioSesion,
    @Query('procesoId', new ParseUUIDPipe({ optional: true })) procesoId?: string,
  ) {
    return this.votos.electivos(u.id, procesoId);
  }

  @Get('electivos/:codigo')
  electivo(
    @UsuarioActual() u: UsuarioSesion,
    @Param('codigo') codigo: string,
    @Query('procesoId', new ParseUUIDPipe({ optional: true })) procesoId?: string,
  ) {
    return this.votos.electivo(u.id, codigo, procesoId);
  }

  @Post('votos')
  emitir(
    @UsuarioActual() u: UsuarioSesion,
    @Body() dto: EmitirVotoDto,
    @Query('procesoId', new ParseUUIDPipe({ optional: true })) procesoId?: string,
  ) {
    return this.votos.emitir(u.id, dto, procesoId);
  }

  @Patch('votos/:codigo')
  editar(
    @UsuarioActual() u: UsuarioSesion,
    @Param('codigo') codigo: string,
    @Body() dto: EmitirVotoDto,
    @Query('procesoId', new ParseUUIDPipe({ optional: true })) procesoId?: string,
  ) {
    return this.votos.cambiar(u.id, codigo, dto, procesoId);
  }

  @Delete('votos/:codigo')
  retirar(
    @UsuarioActual() u: UsuarioSesion,
    @Param('codigo') codigo: string,
    @Query('procesoId', new ParseUUIDPipe({ optional: true })) procesoId?: string,
  ) {
    return this.votos.cambiar(u.id, codigo, undefined, procesoId);
  }

  @Get('votos')
  misVotos(
    @UsuarioActual() u: UsuarioSesion,
    @Query('procesoId', new ParseUUIDPipe({ optional: true })) procesoId?: string,
  ) {
    return this.votos.misVotos(u.id, procesoId);
  }
}
