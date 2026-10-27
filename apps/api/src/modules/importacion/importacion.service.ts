import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { StorageService, OriginalGuardado } from './storage.service';
import { descifrarArchivo } from './archivos';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { config } from '../../config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ProcesosService } from '../procesos/procesos.service';
import { ResultadosGateway } from '../resultados/resultados.gateway';
import { aplicarCatalogo, aplicarCuentas, aplicarHistorial, hashearCuentas } from './aplicar';
import { leerHoja } from './excel';
import {
  COLUMNAS_CATALOGO,
  COLUMNAS_CATALOGO_OPCIONALES,
  CursoImportado,
  validarCatalogo,
} from './validadores/catalogo';
import { COLUMNAS_CUENTAS, COLUMNAS_CUENTAS_OPCIONALES, CuentaImportada, validarCuentas } from './validadores/cuentas';
import {
  COLUMNAS_HISTORIAL,
  COLUMNAS_HISTORIAL_OPCIONALES,
  HistorialImportado,
  validarHistorial,
} from './validadores/historial';
import { ResultadoValidacion } from './validadores/tipos';

export const TIPOS_IMPORTACION = ['catalogo', 'malla', 'cuentas', 'historial'] as const;
export type TipoImportacion = (typeof TIPOS_IMPORTACION)[number];

const VIGENCIA_TOKEN_MS = 30 * 60 * 1000;

const PLANTILLAS: Record<TipoImportacion, string> = {
  catalogo: 'plantilla_catalogo_cursos.xlsx',
  malla: 'plantilla_catalogo_cursos.xlsx',
  cuentas: 'plantilla_cuentas_alumnos.xlsx',
  historial: 'plantilla_historial_academico.xlsx',
};

type Pendiente =
  | { tipo: 'catalogo'; datos: CursoImportado[] }
  | { tipo: 'malla'; datos: CursoImportado[] }
  | { tipo: 'cuentas'; datos: CuentaImportada[] }
  | { tipo: 'historial'; datos: HistorialImportado[] };

interface Vista {
  coordinadorId: string;
  procesoId: string | null;
  expira: number;
  pendiente: Pendiente;
  archivo: Buffer;
  nombre: string;
}

/** Directorio de las plantillas Excel (docs/plantillas en la raíz del repositorio). */
export function directorioPlantillas(): string {
  const candidatos = [
    process.env.PLANTILLAS_DIR,
    resolve(__dirname, '../../../../../docs/plantillas'),
    resolve(process.cwd(), '../../docs/plantillas'),
    resolve(process.cwd(), 'docs/plantillas'),
  ].filter((c): c is string => !!c);
  return candidatos.find((c) => existsSync(c)) ?? candidatos[0];
}

/**
 * Importación en dos pasos: la vista previa valida el archivo y guarda en memoria lo que se
 * aplicaría (el Excel no se persiste); la confirmación aplica en una transacción con el token.
 */
@Injectable()
export class ImportacionService {
  private readonly vistas = new Map<string, Vista>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly procesos: ProcesosService,
    private readonly audit: AuditService,
    private readonly gateway: ResultadosGateway,
    private readonly storage: StorageService,
  ) {}

  rutaPlantilla(tipo: TipoImportacion) {
    const ruta = resolve(directorioPlantillas(), PLANTILLAS[tipo]);
    if (!existsSync(ruta)) throw new NotFoundException('Plantilla no disponible');
    return { ruta, nombre: PLANTILLAS[tipo] };
  }

  async preview(
    tipo: TipoImportacion,
    archivo: Buffer,
    coordinadorId: string,
    procesoId?: string,
    nombre = 'archivo.xlsx',
  ) {
    this.limpiarVencidas();
    const proceso = tipo === 'catalogo' ? null : await this.procesos.resolver(procesoId);

    if (proceso?.primeraApertura)
      throw new BadRequestException('Los datos académicos y el padrón están bloqueados desde la primera apertura');
    const formato = nombre.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx';
    let resultado: ResultadoValidacion<unknown>;
    let pendiente: Pendiente;
    let columnas: string[];

    if (tipo === 'catalogo' || tipo === 'malla') {
      const hoja = await leerHoja(archivo, 'cursos', COLUMNAS_CATALOGO, COLUMNAS_CATALOGO_OPCIONALES, formato);
      const r = validarCatalogo(hoja);
      const codigos = new Set(r.filas.map((f) => f.datos.codigo));
      const conVotos = await this.prisma.curso.findMany({
        where: { votos: { some: {} } },
        select: { codigo: true },
      });
      const conservados = conVotos.map((c) => c.codigo).filter((c) => !codigos.has(c));
      if (conservados.length) {
        r.advertenciasGenerales.push(
          `No vienen en el archivo pero tienen votos, así que se conservan: ${conservados.join(', ')}`,
        );
      }
      resultado = r;
      pendiente = { tipo, datos: r.filas.map((f) => f.datos) };
      columnas = [...COLUMNAS_CATALOGO, ...COLUMNAS_CATALOGO_OPCIONALES];
    } else if (tipo === 'cuentas') {
      const hoja = await leerHoja(archivo, 'alumnos', COLUMNAS_CUENTAS, COLUMNAS_CUENTAS_OPCIONALES, formato);
      const coordinadores = await this.prisma.usuario.findMany({
        where: { rol: 'COORDINADOR' },
        select: { codigo: true },
      });
      const r = validarCuentas(hoja, new Set(coordinadores.map((c) => c.codigo)));
      pendiente = { tipo, datos: r.filas.map((f) => f.datos) };
      // La vista previa nunca devuelve contraseñas.
      resultado = { ...r, filas: r.filas.map((f) => ({ ...f, datos: { ...f.datos, password: '••••••••' } })) };
      columnas = ['codigo', 'nombres', 'apellidos', 'correo', 'password', 'ingreso', 'craest', 'matriculado'];
    } else {
      const hoja = await leerHoja(archivo, 'historial', COLUMNAS_HISTORIAL, COLUMNAS_HISTORIAL_OPCIONALES, formato);
      const [padron, cursos] = await Promise.all([
        this.prisma.padronAlumno.findMany({
          where: { procesoId: proceso!.id },
          select: { usuario: { select: { codigo: true } } },
        }),
        this.prisma.curso.findMany({ select: { codigo: true } }),
      ]);
      const r = validarHistorial(
        hoja,
        new Set(padron.map((p) => p.usuario.codigo)),
        new Set(cursos.map((c) => c.codigo)),
      );
      resultado = r;
      pendiente = { tipo, datos: r.filas.map((f) => f.datos) };
      columnas = ['codigo_alumno', 'codigo_curso', 'nota'];
    }

    const filasConError = resultado.filas.filter((f) => f.errores.length).length;
    const filasConAdvertencia = resultado.filas.filter((f) => !f.errores.length && f.advertencias.length).length;
    const valido = !resultado.erroresGenerales.length && filasConError === 0 && resultado.filas.length > 0;

    let token: string | null = null;
    if (valido) {
      token = randomUUID();
      this.vistas.set(token, {
        coordinadorId,
        procesoId: proceso?.id ?? null,
        expira: Date.now() + VIGENCIA_TOKEN_MS,
        pendiente,
        archivo,
        nombre: nombre.split(/[\\/]/).pop()!.slice(0, 180),
      });
    }

    return {
      tipo,
      token,
      proceso: proceso ? { id: proceso.id, nombre: proceso.nombre } : null,
      columnas,
      resumen: {
        total: resultado.filas.length,
        validas: resultado.filas.length - filasConError,
        conErrores: filasConError,
        conAdvertencias: filasConAdvertencia,
      },
      erroresGenerales: resultado.erroresGenerales,
      advertenciasGenerales: resultado.advertenciasGenerales,
      filas: resultado.filas.map((f) => ({
        ...f,
        datos: tipo === 'catalogo' || tipo === 'malla' ? this.sinTerminos(f.datos as CursoImportado) : f.datos,
      })),
    };
  }

  async confirmar(tipo: TipoImportacion, token: string, coordinadorId: string) {
    this.limpiarVencidas();
    const vista = this.vistas.get(token);
    if (!vista || vista.pendiente.tipo !== tipo || vista.coordinadorId !== coordinadorId) {
      throw new BadRequestException('La vista previa expiró o no es válida. Vuelve a subir el archivo.');
    }
    this.vistas.delete(token); // un solo uso
    const { pendiente, procesoId } = vista;

    const original = await this.storage.subir(vista.nombre, vista.archivo, `${procesoId ?? 'global'}/${tipo}`);
    try {
      if (pendiente.tipo === 'malla') {
        const resumen = await this.prisma.$transaction(
          async (tx) => {
            await this.validarBorrador(tx, procesoId!);
            await aplicarCatalogo(tx, pendiente.datos, false);
            const cursos = await tx.curso.findMany({
              where: { codigo: { in: pendiente.datos.map((c) => c.codigo) } },
              include: { requisitos: { orderBy: { orden: 'asc' } } },
            });
            await tx.procesoVotacion.update({
              where: { id: procesoId! },
              data: { catalogo: JSON.parse(JSON.stringify(cursos)) },
            });
            await this.archivar(tx, vista, coordinadorId, original);
            return { cursos: cursos.length };
          },
          { timeout: 60_000 },
        );
        await this.audit.registrar('IMPORT_CATALOGO', coordinadorId, { procesoId, ...resumen });
        this.gateway.notificar('importacion', procesoId!);
        return { tipo, ...resumen };
      }
      if (pendiente.tipo === 'catalogo') {
        const resumen = await this.prisma.$transaction(
          async (tx) => {
            const resumen = await aplicarCatalogo(tx, pendiente.datos);
            await this.archivar(tx, vista, coordinadorId, original);
            return resumen;
          },
          { timeout: 60_000 },
        );
        await this.audit.registrar('IMPORT_CATALOGO', coordinadorId, { ...resumen, filas: pendiente.datos.length });
        this.gateway.notificar('importacion');
        return { tipo, ...resumen };
      }
      if (pendiente.tipo === 'cuentas') {
        await this.procesos.obtener(procesoId!);
        const hasheadas = await hashearCuentas(pendiente.datos, config.bcryptCost);
        const resumen = await this.prisma.$transaction(
          async (tx) => {
            await this.validarBorrador(tx, procesoId!);
            const resumen = await aplicarCuentas(tx, procesoId!, hasheadas);
            await this.archivar(tx, vista, coordinadorId, original);
            return resumen;
          },
          {
            timeout: 60_000,
          },
        );
        await this.audit.registrar('IMPORT_CUENTAS', coordinadorId, { procesoId, ...resumen });
        this.gateway.notificar('importacion', procesoId!);
        return { tipo, ...resumen };
      }
      await this.procesos.obtener(procesoId!);
      const resumen = await this.prisma.$transaction(
        async (tx) => {
          await this.validarBorrador(tx, procesoId!);
          const resumen = await aplicarHistorial(tx, procesoId!, pendiente.datos);
          await this.archivar(tx, vista, coordinadorId, original);
          return resumen;
        },
        {
          timeout: 60_000,
        },
      );
      await this.audit.registrar('IMPORT_HISTORIAL', coordinadorId, { procesoId, ...resumen });
      this.gateway.notificar('importacion', procesoId!);
      return { tipo, ...resumen };
    } catch (e) {
      // Si el commit ya se realizó, conservar el objeto aunque falle la auditoría.
      const registrado = await this.prisma.archivoCarga.count({
        where: { bucket: original.bucket, ruta: original.ruta },
      });
      if (!registrado) await this.storage.eliminar(original.bucket, original.ruta).catch(() => undefined);
      if (e instanceof NotFoundException) throw e;
      // Los datos cambiaron entre la vista previa y la confirmación (p. ej. el padrón).
      throw new ConflictException(
        `No se pudo aplicar la importación: ${(e as Error).message}. Vuelve a generar la vista previa.`,
      );
    }
  }

  private async archivar(tx: Prisma.TransactionClient, vista: Vista, actorId: string, original: OriginalGuardado) {
    await tx.archivoCarga.create({
      data: {
        nombre: vista.nombre,
        tipo: vista.pendiente.tipo,
        procesoId: vista.procesoId,
        actorId,
        filas: vista.pendiente.datos.length,
        ...original,
      },
    });
  }

  listarArchivos(procesoId?: string) {
    return this.prisma.archivoCarga.findMany({
      where: procesoId ? { OR: [{ procesoId }, { procesoId: null }] } : {},
      select: {
        id: true,
        nombre: true,
        tipo: true,
        procesoId: true,
        actorId: true,
        sha256: true,
        filas: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async descargarArchivo(id: string) {
    const archivo = await this.prisma.archivoCarga.findUnique({ where: { id } });
    if (!archivo) throw new NotFoundException('Archivo no encontrado');
    if (archivo.bucket && archivo.ruta)
      return { nombre: archivo.nombre, buffer: await this.storage.descargar(archivo.bucket, archivo.ruta) };
    // Las cargas antiguas se migran al descargarlas, sin perder el original.
    if (!archivo.contenido) throw new NotFoundException('Original no disponible');
    const buffer = descifrarArchivo(Buffer.from(archivo.contenido));
    const original = await this.storage.subir(
      archivo.nombre,
      buffer,
      `${archivo.procesoId ?? 'global'}/${archivo.tipo}`,
    );
    await this.prisma.archivoCarga.update({ where: { id }, data: { ...original, contenido: null } });
    return { nombre: archivo.nombre, buffer };
  }

  private async validarBorrador(tx: Prisma.TransactionClient, procesoId: string) {
    await tx.$queryRaw`SELECT 1 FROM "ProcesoVotacion" WHERE id = ${procesoId} FOR UPDATE`;
    const proceso = await tx.procesoVotacion.findUniqueOrThrow({ where: { id: procesoId } });
    if (proceso.primeraApertura || proceso.estado !== 'BORRADOR')
      throw new BadRequestException('Los datos académicos y el padrón están bloqueados desde la primera apertura');
  }

  private sinTerminos({ terminos: _, ...resto }: CursoImportado) {
    return resto;
  }

  private limpiarVencidas() {
    const ahora = Date.now();
    for (const [token, v] of this.vistas) if (v.expira < ahora) this.vistas.delete(token);
  }
}
