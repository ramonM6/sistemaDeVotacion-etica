import { ResultadosGateway } from '../resultados/resultados.gateway';
import { StorageModule } from '../importacion/storage.module';
import { StorageService } from '../importacion/storage.service';
import {
  Module,
  Injectable,
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  Query,
  BadRequestException,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { Roles, UsuarioActual, UsuarioSesion } from '../../common/auth.decorators';
import { AuditService } from '../audit/audit.service';
import { ProcesosModule } from '../procesos/procesos.module';
import { ProcesosService } from '../procesos/procesos.service';
import { Readable } from 'stream';
import * as ExcelJS from 'exceljs';

class DecisionDto {
  @IsOptional() @IsIn(['PENDIENTE', 'SELECCIONADO_PARA_REVISION', 'NO_SELECCIONADO']) seleccion?: string;
  @IsOptional() @IsIn(['PENDIENTE', 'APROBADO', 'NO_APROBADO']) consejo?: string;
  @IsOptional() @IsIn(['PENDIENTE', 'CONFIRMADO', 'NO_SE_DICTARA']) dictado?: string;
  @IsOptional() @IsString() @MaxLength(2000) observacion?: string;
}
class DecisionLoteDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(/^[A-Z0-9]{6}$/, { each: true })
  codigos: string[];
  @IsIn(['seleccion', 'consejo', 'dictado']) etapa: 'seleccion' | 'consejo' | 'dictado';
  @IsIn([
    'PENDIENTE',
    'SELECCIONADO_PARA_REVISION',
    'NO_SELECCIONADO',
    'APROBADO',
    'NO_APROBADO',
    'CONFIRMADO',
    'NO_SE_DICTARA',
  ])
  estado: string;
}

class CsvDto {
  @IsString() @MaxLength(2000000) csv: string;
}

@Injectable()
class SeguimientoService {
  constructor(
    private readonly db: PrismaService,
    private readonly procesos: ProcesosService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly gateway: ResultadosGateway,
  ) {}

  async listar(procesoId?: string) {
    const proceso = await this.procesos.resolver(procesoId);
    const [cursos, decisiones] = await Promise.all([
      this.db.curso.findMany({
        where: { tipo: 'ELECTIVO', activo: true },
        orderBy: { codigo: 'asc' },
        select: { codigo: true, nombre: true },
      }),
      this.db.seguimientoCurso.findMany({ where: { procesoId: proceso.id } }),
    ]);
    return {
      proceso,
      cursos: (Array.isArray(proceso.catalogo)
        ? (proceso.catalogo as unknown as { codigo: string; nombre: string; tipo: string }[]).filter(
            (c) => c.tipo === 'ELECTIVO',
          )
        : cursos
      ).map((c) => ({
        ...c,
        seleccion: 'PENDIENTE',
        consejo: 'PENDIENTE',
        dictado: 'PENDIENTE',
        observacion: '',
        ...decisiones.find((d) => d.cursoCodigo === c.codigo),
      })),
    };
  }

  async guardar(
    procesoId: string | undefined,
    filas: { codigo: string; decision: DecisionDto }[],
    actor: string,
    csv?: string,
    etapa?: 'seleccion' | 'consejo' | 'dictado',
  ) {
    const proceso = await this.procesos.resolver(procesoId);
    const original =
      csv !== undefined
        ? await this.storage.subir('decisiones-consejo.csv', Buffer.from(csv, 'utf8'), `${proceso.id}/consejo`)
        : null;
    try {
      await this.db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT 1 FROM "ProcesoVotacion" WHERE id = ${proceso.id} FOR UPDATE`;
          const actual = await tx.procesoVotacion.findUniqueOrThrow({ where: { id: proceso.id } });
          if (actual.estado !== 'CERRADO')
            throw new BadRequestException('Los estados de los cursos se modifican después del cierre');
          for (const { codigo, decision } of filas) {
            const curso = Array.isArray(actual.catalogo)
              ? (actual.catalogo as unknown as { codigo: string; tipo: string }[]).find((c) => c.codigo === codigo)
              : await tx.curso.findUnique({ where: { codigo } });
            if (!curso || curso.tipo !== 'ELECTIVO') throw new BadRequestException(`Electivo desconocido: ${codigo}`);
            const anterior = await tx.seguimientoCurso.findUnique({
              where: { procesoId_cursoCodigo: { procesoId: proceso.id, cursoCodigo: codigo } },
            });
            if (etapa === 'consejo' && anterior?.seleccion !== 'SELECCIONADO_PARA_REVISION')
              throw new BadRequestException(`${codigo}: no está seleccionado para revisión en esta votación`);
            if (
              etapa === 'dictado' &&
              (anterior?.seleccion !== 'SELECCIONADO_PARA_REVISION' || anterior?.consejo !== 'APROBADO')
            )
              throw new BadRequestException(`${codigo}: no está aprobado para la etapa de dictado`);
            const cambios = Object.fromEntries(
              Object.entries(decision).filter(([, valor]) => valor !== undefined),
            ) as DecisionDto;
            if (
              decision.seleccion !== undefined &&
              (decision.seleccion !== anterior?.seleccion ||
                (decision.consejo === undefined && decision.dictado === undefined))
            ) {
              if (decision.consejo === undefined) cambios.consejo = 'PENDIENTE';
              if (decision.dictado === undefined) cambios.dictado = 'PENDIENTE';
            }
            if (
              decision.consejo !== undefined &&
              decision.consejo !== anterior?.consejo &&
              decision.dictado === undefined
            )
              cambios.dictado = 'PENDIENTE';
            const datos = {
              seleccion: 'PENDIENTE',
              consejo: 'PENDIENTE',
              dictado: 'PENDIENTE',
              observacion: '',
              ...anterior,
              ...cambios,
            };
            if (datos.consejo !== 'PENDIENTE' && datos.seleccion !== 'SELECCIONADO_PARA_REVISION')
              throw new BadRequestException(
                `${codigo}: selecciona el curso para revisión antes de registrar el consejo`,
              );
            if (datos.dictado !== 'PENDIENTE' && datos.consejo !== 'APROBADO')
              throw new BadRequestException(`${codigo}: la decisión de dictado requiere aprobación previa del consejo`);
            await tx.seguimientoCurso.upsert({
              where: { procesoId_cursoCodigo: { procesoId: proceso.id, cursoCodigo: codigo } },
              create: { procesoId: proceso.id, cursoCodigo: codigo, ...cambios },
              update: cambios,
            });
          }
          if (csv !== undefined)
            await tx.archivoCarga.create({
              data: {
                nombre: 'decisiones-consejo.csv',
                tipo: 'consejo',
                procesoId: proceso.id,
                actorId: actor,
                filas: filas.length,
                ...original!,
              },
            });
        },
        { timeout: 60000 },
      );
    } catch (error) {
      if (original) await this.storage.eliminar(original.bucket, original.ruta).catch(() => undefined);
      throw error;
    }
    await this.audit.registrar('SEGUIMIENTO_CONSEJO', actor, {
      procesoId: proceso.id,
      cursos: filas.map((f) => f.codigo),
    });
    this.gateway.notificar('seguimiento', proceso.id);
    return this.listar(proceso.id);
  }

  async lote(procesoId: string, dto: DecisionLoteDto, actor: string) {
    const opciones = {
      seleccion: ['PENDIENTE', 'SELECCIONADO_PARA_REVISION', 'NO_SELECCIONADO'],
      consejo: ['APROBADO', 'NO_APROBADO'],
      dictado: ['CONFIRMADO', 'NO_SE_DICTARA'],
    };
    if (!opciones[dto.etapa].includes(dto.estado))
      throw new BadRequestException('El estado no corresponde a esta etapa');
    const decision: DecisionDto =
      dto.etapa === 'seleccion'
        ? { seleccion: dto.estado, consejo: 'PENDIENTE', dictado: 'PENDIENTE' }
        : dto.etapa === 'consejo'
          ? { consejo: dto.estado, dictado: 'PENDIENTE' }
          : { dictado: dto.estado };
    return this.guardar(
      procesoId,
      dto.codigos.map((codigo) => ({ codigo, decision })),
      actor,
      undefined,
      dto.etapa,
    );
  }

  async csv(procesoId: string | undefined, csv: string, actor: string, confirmar: boolean) {
    if (Buffer.byteLength(csv, 'utf8') > 2000000) throw new BadRequestException('El CSV supera 2 MB');
    const libro = new ExcelJS.Workbook();
    let hoja: ExcelJS.Worksheet;
    try {
      hoja = await libro.csv.read(Readable.from([csv]));
    } catch {
      throw new BadRequestException('CSV inválido');
    }
    const encabezado = (hoja.getRow(1).values as unknown[]).slice(1).map((x) =>
      String(x)
        .trim()
        .replace(/^\uFEFF/, ''),
    );
    if (encabezado.join(',') !== 'codigo,consejo,dictado,observacion')
      throw new BadRequestException('Columnas esperadas: codigo,consejo,dictado,observacion');
    const filas: { codigo: string; decision: DecisionDto }[] = [];
    const vistos = new Set<string>();
    hoja.eachRow((fila, numero) => {
      if (numero === 1) return;
      const codigo = String(fila.getCell(1).value ?? '')
        .trim()
        .toUpperCase();
      const consejo = String(fila.getCell(2).value ?? '').trim();
      const dictado = String(fila.getCell(3).value ?? '').trim();
      const observacion = String(fila.getCell(4).value ?? '').trim();
      if (
        vistos.has(codigo) ||
        !/^[A-Z0-9]{6}$/.test(codigo) ||
        !['PENDIENTE', 'APROBADO', 'NO_APROBADO'].includes(consejo) ||
        !['PENDIENTE', 'CONFIRMADO', 'NO_SE_DICTARA'].includes(dictado) ||
        observacion.length > 2000
      )
        throw new BadRequestException(`Fila ${numero} inválida o duplicada`);
      vistos.add(codigo);
      filas.push({ codigo, decision: { consejo, dictado, observacion } });
    });
    if (!filas.length || filas.length > 15000)
      throw new BadRequestException('El archivo debe contener de 1 a 15000 cursos');
    if (confirmar) return this.guardar(procesoId, filas, actor, csv);
    const estado = await this.listar(procesoId);
    if (estado.proceso.estado !== 'CERRADO') throw new BadRequestException('El proceso debe estar cerrado');
    for (const fila of filas) {
      const curso = estado.cursos.find((c) => c.codigo === fila.codigo);
      if (
        !curso ||
        (fila.decision.consejo !== 'PENDIENTE' && curso.seleccion !== 'SELECCIONADO_PARA_REVISION') ||
        (fila.decision.dictado !== 'PENDIENTE' && fila.decision.consejo !== 'APROBADO')
      )
        throw new BadRequestException(`${fila.codigo}: curso desconocido, no seleccionado o decisión incompatible`);
    }
    return { filas, procesoId: estado.proceso.id };
  }
}

@Roles('ALUMNO')
@Controller('alumno/seguimiento')
class SeguimientoAlumnoController {
  constructor(
    private readonly servicio: SeguimientoService,
    private readonly procesos: ProcesosService,
  ) {}
  @Get()
  async listar(@UsuarioActual() u: UsuarioSesion, @Query('procesoId', ParseUUIDPipe) id: string) {
    const proceso = await this.procesos.obtener(id);
    if (proceso.estado === 'BORRADOR' || !(await this.procesos.estaEnPadron(id, u.id)))
      throw new ForbiddenException('No estás habilitado en esta votación');
    const datos = await this.servicio.listar(id);
    return {
      proceso,
      cursos: datos.cursos.map((c) => ({
        codigo: c.codigo,
        nombre: c.nombre,
        seleccion: c.seleccion,
        consejo: c.consejo,
        dictado: c.dictado,
      })),
    };
  }
}

@Roles('COORDINADOR')
@Controller('coord/seguimiento')
class SeguimientoController {
  constructor(private readonly servicio: SeguimientoService) {}
  @Get() listar(@Query('procesoId') id?: string) {
    return this.servicio.listar(id);
  }
  @Post('lote')
  lote(@Body() dto: DecisionLoteDto, @UsuarioActual() u: UsuarioSesion, @Query('procesoId', ParseUUIDPipe) id: string) {
    return this.servicio.lote(id, dto, u.id);
  }
  @Patch(':codigo') guardar(
    @Param('codigo') codigo: string,
    @Body() dto: DecisionDto,
    @UsuarioActual() u: UsuarioSesion,
    @Query('procesoId') id?: string,
  ) {
    return this.servicio.guardar(id, [{ codigo: codigo.toUpperCase(), decision: dto }], u.id);
  }
  @Post('csv/preview') preview(
    @Body() dto: CsvDto,
    @UsuarioActual() u: UsuarioSesion,
    @Query('procesoId') id?: string,
  ) {
    return this.servicio.csv(id, dto.csv, u.id, false);
  }
  @Post('csv/confirmar') confirmar(
    @Body() dto: CsvDto,
    @UsuarioActual() u: UsuarioSesion,
    @Query('procesoId') id?: string,
  ) {
    return this.servicio.csv(id, dto.csv, u.id, true);
  }
}

@Module({
  imports: [ProcesosModule, StorageModule],
  providers: [SeguimientoService],
  controllers: [SeguimientoController, SeguimientoAlumnoController],
})
export class SeguimientoModule {}
