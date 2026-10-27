import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { Roles, UsuarioActual, UsuarioSesion } from '../../common/auth.decorators';
import { CambiarEstadoDto, CrearProcesoDto, EditarProcesoDto } from './procesos.dto';
import { ProcesosService } from './procesos.service';

@Controller('procesos')
export class ProcesosController {
  constructor(private readonly procesos: ProcesosService) {}

  /** Proceso abierto (o el último). Cualquier usuario autenticado. */
  @Get('activo')
  activo() {
    return this.procesos.obtenerActivo();
  }
}

@Roles('COORDINADOR')
@Controller('coord/procesos')
export class CoordProcesosController {
  constructor(private readonly procesos: ProcesosService) {}

  @Get()
  listar() {
    return this.procesos.listar();
  }

  @Post()
  crear(@Body() dto: CrearProcesoDto, @UsuarioActual() u: UsuarioSesion) {
    return this.procesos.crear(dto, u.id);
  }

  @Patch(':id')
  editar(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EditarProcesoDto, @UsuarioActual() u: UsuarioSesion) {
    return this.procesos.editar(id, dto, u.id);
  }

  @Patch(':id/estado')
  cambiarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CambiarEstadoDto,
    @UsuarioActual() u: UsuarioSesion,
  ) {
    return this.procesos.cambiarEstado(id, dto, u.id);
  }
}
