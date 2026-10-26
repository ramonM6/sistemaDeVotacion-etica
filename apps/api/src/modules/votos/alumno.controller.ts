import { Body, Controller, Delete, Patch, Get, Param, Post } from '@nestjs/common';
import { Roles, UsuarioActual, UsuarioSesion } from '../../common/auth.decorators';
import { EmitirVotoDto } from './votos.dto';
import { VotosService } from './votos.service';

/** Endpoints del alumno. Todos operan solo sobre los datos del alumno de la sesión. */
@Roles('ALUMNO')
@Controller('alumno')
export class AlumnoController {
  constructor(private readonly votos: VotosService) {}

  @Get('estado')
  estado(@UsuarioActual() u: UsuarioSesion) {
    return this.votos.estado(u.id);
  }

  @Post('terminos')
  aceptarTerminos(@UsuarioActual() u: UsuarioSesion) {
    return this.votos.aceptarTerminos(u.id);
  }

  @Get('electivos')
  electivos(@UsuarioActual() u: UsuarioSesion) {
    return this.votos.electivos(u.id);
  }

  @Get('electivos/:codigo')
  electivo(@UsuarioActual() u: UsuarioSesion, @Param('codigo') codigo: string) {
    return this.votos.electivo(u.id, codigo);
  }

  @Post('votos')
  emitir(@UsuarioActual() u: UsuarioSesion, @Body() dto: EmitirVotoDto) {
    return this.votos.emitir(u.id, dto);
  }

  @Patch('votos/:codigo')
  editar(@UsuarioActual() u: UsuarioSesion, @Param('codigo') codigo: string, @Body() dto: EmitirVotoDto) {
    return this.votos.cambiar(u.id, codigo, dto);
  }

  @Delete('votos/:codigo')
  retirar(@UsuarioActual() u: UsuarioSesion, @Param('codigo') codigo: string) {
    return this.votos.cambiar(u.id, codigo);
  }

  @Get('votos')
  misVotos(@UsuarioActual() u: UsuarioSesion) {
    return this.votos.misVotos(u.id);
  }
}
