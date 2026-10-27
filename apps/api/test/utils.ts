import { StorageService } from '../src/modules/importacion/storage.service';
import { StorageFalso } from './storage-falso';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Franja, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as ExcelJS from 'exceljs';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configurarApp } from '../src/bootstrap';
import { TERMINOS_VERSION } from '../src/common/terminos';
import { parsearRequisitos } from '../src/modules/elegibilidad/motor';
import { aplicarCatalogo } from '../src/modules/importacion/aplicar';
import { CursoImportado } from '../src/modules/importacion/validadores/catalogo';

export const PASSWORD = 'Alumno#Test1';

export async function crearApp(): Promise<INestApplication> {
  const modulo = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(StorageService)
    .useValue(new StorageFalso())
    .compile();
  const app = modulo.createNestApplication<NestExpressApplication>();
  configurarApp(app);
  await app.init();
  return app;
}

/** Vacía todas las tablas. */
export async function limpiar(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "ArchivoCarga","VotoFranja","Voto","AceptacionTerminos","HistorialItem","PadronAlumno","ProcesoVotacion","Requisito","Curso","AuditLog","Usuario" CASCADE',
  );
}

function curso(
  codigo: string,
  creditos: number,
  tipo: CursoImportado['tipo'],
  requisitos: string | null = null,
  descripcion: string | null = null,
): CursoImportado {
  return {
    codigo,
    nombre: `Curso ${codigo}`,
    creditos,
    tipo,
    ciclo: null,
    grupo: null,
    requisitos,
    descripcion,
    terminos: tipo === 'ELECTIVO' ? parsearRequisitos(requisitos).terminos : [],
  };
}

/** Catálogo reducido: 3 obligatorios y 7 electivos con distintos tipos de requisito. */
export const CATALOGO = [
  curso('1INF24', 3.5, 'OBLIGATORIO'),
  curso('1INF41', 3.5, 'OBLIGATORIO'),
  curso('BLOQUE', 50, 'OBLIGATORIO'),
  curso('1INF02', 3.5, 'ELECTIVO', '1INF24', 'Aprendizaje de máquina'),
  curso('1INF64', 3.5, 'ELECTIVO', '1INF24, 1INF41'),
  curso('DER349', 3, 'ELECTIVO', '50 créditos aprobados *'),
  curso('INF310', 3, 'ELECTIVO'),
  curso('INF356', 3.5, 'ELECTIVO'),
  curso('INF372', 4, 'ELECTIVO'),
  curso('INF373', 4, 'ELECTIVO'),
];

export interface Escenario {
  procesoId: string;
  alumnos: Record<string, string>; // codigo → id
}

/**
 * Crea coordinador, catálogo, un proceso ABIERTO y alumnos:
 * - 20000001: 1INF24 aprobado, BLOQUE aprobado → casi todo CONFIRMADO
 * - 20000002: 1INF24 en curso → 1INF02 CONDICIONAL
 * - 20000003: sin historial → solo electivos sin requisitos
 * - 20000004: igual que el 1 (para pruebas de concurrencia)
 * - 20000009: tiene cuenta pero NO está en el padrón
 */
export async function escenarioBase(prisma: PrismaClient): Promise<Escenario> {
  await limpiar(prisma);
  const hash = await bcrypt.hash(PASSWORD, 4);
  await prisma.usuario.create({
    data: {
      codigo: process.env.COORD_USER!,
      nombres: 'Coord',
      apellidos: 'Test',
      rol: 'COORDINADOR',
      passwordHash: await bcrypt.hash(process.env.COORD_PASSWORD!, 4),
    },
  });
  await aplicarCatalogo(prisma, CATALOGO);
  const proceso = await prisma.procesoVotacion.create({
    data: {
      nombre: 'Proceso de prueba',
      cicloObjetivo: '2027-1',
      fechaInicio: new Date(Date.now() - 86_400_000),
      fechaFin: new Date(Date.now() + 86_400_000),
      estado: 'ABIERTO',
    },
  });
  const alumnos: Record<string, string> = {};
  for (const codigo of ['20000001', '20000002', '20000003', '20000004', '20000009']) {
    const u = await prisma.usuario.create({
      data: { codigo, nombres: `Nombre ${codigo}`, apellidos: `Apellido ${codigo}`, rol: 'ALUMNO', passwordHash: hash },
    });
    alumnos[codigo] = u.id;
    if (codigo !== '20000009') await prisma.padronAlumno.create({ data: { procesoId: proceso.id, usuarioId: u.id } });
  }
  const historial: [string, string, number | null][] = [
    ['20000001', '1INF24', 15],
    ['20000001', '1INF41', 13],
    ['20000001', 'BLOQUE', 14],
    ['20000002', '1INF24', null],
    ['20000004', '1INF24', 12],
    ['20000004', 'BLOQUE', 12],
  ];
  await prisma.historialItem.createMany({
    data: historial.map(([codigo, cursoCodigo, nota]) => ({
      procesoId: proceso.id,
      usuarioId: alumnos[codigo],
      cursoCodigo,
      nota,
    })),
  });
  return { procesoId: proceso.id, alumnos };
}

export async function aceptarTerminos(prisma: PrismaClient, procesoId: string, usuarioId: string) {
  await prisma.aceptacionTerminos.create({ data: { procesoId, usuarioId, version: TERMINOS_VERSION } });
}

/** Inicia sesión y devuelve un agente de Supertest con la cookie. */
export async function sesion(app: INestApplication, codigo: string, password = PASSWORD) {
  const agente = request.agent(app.getHttpServer());
  const res = await agente.post('/api/auth/login').send({ codigo, password });
  if (res.status !== 200) throw new Error(`Login de ${codigo} falló: ${res.status} ${JSON.stringify(res.body)}`);
  return agente;
}

export const voto = (cursoCodigo: string, franjas: Franja[] | string[]) => ({ cursoCodigo, franjas });

/** Construye un .xlsx en memoria con una hoja y las filas dadas (la primera es el encabezado). */
export async function xlsx(hoja: string, filas: unknown[][]): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  const h = libro.addWorksheet(hoja);
  for (const f of filas) h.addRow(f);
  return Buffer.from(await libro.xlsx.writeBuffer());
}
