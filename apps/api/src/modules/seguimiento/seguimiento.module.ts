import { cifrarArchivo } from '../importacion/archivos';
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
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
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
class CsvDto {
  @IsString() @MaxLength(2000000) csv: string;
}

@Injectable()
class SeguimientoService {
  constructor(
    private readonly db: PrismaService,
    private readonly procesos: ProcesosService,
    private readonly audit: AuditService,
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
  ) {
    const proceso = await this.procesos.resolver(procesoId);
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
            throw new BadRequestException(`${codigo}: selecciona el curso para revisión antes de registrar el consejo`);
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
              ...cifrarArchivo(Buffer.from(csv, 'utf8')),
            },
          });
      },
      { timeout: 60000 },
    );
    await this.audit.registrar('SEGUIMIENTO_CONSEJO', actor, {
      procesoId: proceso.id,
      cursos: filas.map((f) => f.codigo),
    });
    return this.listar(proceso.id);
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

@Roles('COORDINADOR')
@Controller('coord/seguimiento')
class SeguimientoController {
  constructor(private readonly servicio: SeguimientoService) {}
  @Get() listar(@Query('procesoId') id?: string) {
    return this.servicio.listar(id);
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

@Module({ imports: [ProcesosModule], providers: [SeguimientoService], controllers: [SeguimientoController] })
export class SeguimientoModule {}
