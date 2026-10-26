/**
 * Datos de prueba (sección 13 de la especificación). Es idempotente:
 * - siempre crea/actualiza el coordinador (COORD_USER / COORD_PASSWORD) y el catálogo;
 * - el proceso de demostración, los alumnos sintéticos y sus votos se crean solo si aún no hay
 *   ningún proceso (para reiniciar todo: `npm run db:reset`).
 */
import 'dotenv/config';
import { Franja, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { TERMINOS_VERSION } from '../src/common/terminos';
import { ElegibilidadRepository } from '../src/modules/elegibilidad/elegibilidad.repository';
import { ElegibilidadService } from '../src/modules/elegibilidad/elegibilidad.service';
import { aplicarCatalogo, aplicarCuentas, aplicarHistorial, hashearCuentas } from '../src/modules/importacion/aplicar';
import { leerHoja } from '../src/modules/importacion/excel';
import { directorioPlantillas } from '../src/modules/importacion/importacion.service';
import {
  COLUMNAS_CATALOGO,
  COLUMNAS_CATALOGO_OPCIONALES,
  validarCatalogo,
} from '../src/modules/importacion/validadores/catalogo';
import { HistorialImportado } from '../src/modules/importacion/validadores/historial';
import { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaClient();
const PASSWORD_ALUMNOS = 'Alumno#2026';

// ---------- Generador determinista de notas aprobatorias ----------
let semilla = 20261;
function aleatorio() {
  semilla = (semilla * 1103515245 + 12345) % 2 ** 31;
  return semilla / 2 ** 31;
}
const notaAprobada = () => 11 + Math.floor(aleatorio() * 8); // 11–18

type Fila = { curso: string; nota: number | null };

async function main() {
  // ---------- Coordinador ----------
  const coordUser = process.env.COORD_USER ?? 'coordinador';
  const coordPassword = process.env.COORD_PASSWORD ?? 'Coordinador#2026';
  await prisma.usuario.upsert({
    where: { codigo: coordUser },
    create: {
      codigo: coordUser,
      nombres: 'Coordinación',
      apellidos: 'Académica',
      rol: 'COORDINADOR',
      passwordHash: await bcrypt.hash(coordPassword, 10),
    },
    update: { passwordHash: await bcrypt.hash(coordPassword, 10), rol: 'COORDINADOR' },
  });
  console.log(`✔ Coordinador: ${coordUser}`);

  // ---------- Catálogo desde la plantilla ----------
  const archivo = readFileSync(resolve(directorioPlantillas(), 'plantilla_catalogo_cursos.xlsx'));
  const hoja = await leerHoja(archivo, 'cursos', COLUMNAS_CATALOGO, COLUMNAS_CATALOGO_OPCIONALES);
  const validacion = validarCatalogo(hoja);
  const conErrores = validacion.filas.filter((f) => f.errores.length);
  if (validacion.erroresGenerales.length || conErrores.length) {
    throw new Error(
      `La plantilla del catálogo tiene errores: ${[...validacion.erroresGenerales, ...conErrores.map((f) => `fila ${f.fila}: ${f.errores.join('; ')}`)].join(' | ')}`,
    );
  }
  const cursos = validacion.filas.map((f) => f.datos);
  await prisma.$transaction((tx) => aplicarCatalogo(tx, cursos), { timeout: 60_000 });
  console.log(`✔ Catálogo: ${cursos.length} cursos (${cursos.filter((c) => c.tipo === 'ELECTIVO').length} electivos)`);

  if (await prisma.procesoVotacion.count()) {
    console.log(
      '• Ya existe al menos un proceso: no se crean datos de demostración (usa `npm run db:reset` para reiniciar).',
    );
    return;
  }

  // ---------- Proceso abierto ----------
  const ahora = new Date();
  const proceso = await prisma.procesoVotacion.create({
    data: {
      nombre: 'Electivos 2027-1',
      cicloObjetivo: '2027-1',
      fechaInicio: new Date(ahora.getTime() - 2 * 24 * 3600 * 1000),
      fechaFin: new Date(ahora.getTime() + 12 * 24 * 3600 * 1000),
      maxCursos: 5,
      maxFranjas: 2,
      estado: 'ABIERTO',
      primeraApertura: new Date(),
      catalogo: JSON.parse(
        JSON.stringify(
          await prisma.curso.findMany({
            where: { activo: true },
            include: { requisitos: { orderBy: { orden: 'asc' } } },
          }),
        ),
      ),
    },
  });
  console.log(`✔ Proceso ABIERTO: ${proceso.nombre}`);

  // ---------- Historiales sintéticos ----------
  const obligatoriosDe = (ciclo: number) =>
    cursos.filter((c) => c.tipo === 'OBLIGATORIO' && c.ciclo === ciclo).map((c) => c.codigo);

  /** Aprueba todos los obligatorios de los ciclos indicados (menos los excluidos) + un electivo de EH1, EH2 y TEO. */
  function base(hastaCiclo: number, generales: [string, string, string], excepto: string[] = []): Fila[] {
    const filas: Fila[] = [];
    for (let ciclo = 1; ciclo <= hastaCiclo; ciclo++) {
      for (const curso of obligatoriosDe(ciclo))
        if (!excepto.includes(curso)) filas.push({ curso, nota: notaAprobada() });
    }
    if (hastaCiclo >= 2) filas.push({ curso: generales[0], nota: notaAprobada() });
    if (hastaCiclo >= 4) {
      filas.push({ curso: generales[1], nota: notaAprobada() });
      filas.push({ curso: generales[2], nota: notaAprobada() });
    }
    return filas;
  }
  const enCurso = (...codigos: string[]): Fila[] => codigos.map((curso) => ({ curso, nota: null }));
  const cicloEnCurso = (ciclo: number, excepto: string[] = []) =>
    enCurso(...obligatoriosDe(ciclo).filter((c) => !excepto.includes(c)));
  const nota = (curso: string, n: number): Fila => ({ curso, nota: n });

  const alumnos: { codigo: string; nombres: string; apellidos: string; caso: string; historial: Fila[] }[] = [
    {
      codigo: '20220101',
      nombres: 'Ana Lucía',
      apellidos: 'Torres Medina',
      caso: 'Ciclo 5: casi ningún electivo apto',
      historial: [...base(4, ['1HUM02', '1PSI04', '1TEO01']), ...cicloEnCurso(5)],
    },
    {
      codigo: '20210202',
      nombres: 'Bruno',
      apellidos: 'Castillo Ramos',
      caso: 'Ciclo 6',
      historial: [...base(5, ['1HIS02', '1LIT16', 'CDR121']), ...cicloEnCurso(6)],
    },
    {
      codigo: '20200303',
      nombres: 'Carla',
      apellidos: 'Huamán Flores',
      caso: 'Ciclo 8 con IA (1INF24) en curso → CONDICIONAL en los electivos de IA',
      historial: [
        ...base(7, ['1PSI02', '1SOC01', '1TEO02'], ['1INF24']),
        ...enCurso('1INF24', '1INF37', '1INF39', '1INF65', '1INF26'),
      ],
    },
    {
      codigo: '20201234',
      nombres: 'María Fernanda',
      apellidos: 'Quispe Rojas',
      caso: 'Plantilla: 1INF29 con 8 (cumple (1INF29)), 1INF24 y 1INF39 en curso',
      historial: [
        ...base(6, ['1HUM02', '1ANT01', '1CDR01'], ['1INF29', '1INF32']),
        nota('1INF32', 14),
        nota('1INF29', 8),
        ...obligatoriosDe(7)
          .filter((c) => !['1INF24', '1INF35'].includes(c))
          .map((c) => nota(c, notaAprobada())),
        nota('1INF35', 12),
        ...enCurso('1INF24', '1INF39'),
      ],
    },
    {
      codigo: '20195678',
      nombres: 'Luis Alberto',
      apellidos: 'Gonzales Paredes',
      caso: 'Plantilla: 1INF24 jalado (9) y luego aprobado (15)',
      historial: [
        ...base(7, ['1EGC01', '1PSI04', 'TEO111'], ['1INF24', '1INF30']),
        nota('1INF24', 9),
        nota('1INF24', 15),
        nota('1INF30', 13),
        ...cicloEnCurso(8),
      ],
    },
    {
      codigo: '20200404',
      nombres: 'Diego',
      apellidos: 'Salazar Vega',
      caso: '1INF29 con 8 y 1INF35 en curso → 1INF51 CONDICIONAL',
      historial: [...base(6, ['1HIS03', '1ARQ11', 'CDR123'], ['1INF29']), nota('1INF29', 8), ...cicloEnCurso(7)],
    },
    {
      codigo: '20190505',
      nombres: 'Elena',
      apellidos: 'Ríos Paredes',
      caso: 'Curso jalado (1INF24: 7) y luego aprobado (14)',
      historial: [
        ...base(7, ['1PSI03', '1EGC03', '1TEO03'], ['1INF24']),
        nota('1INF24', 7),
        nota('1INF24', 14),
        ...cicloEnCurso(8),
      ],
    },
    {
      codigo: '20190606',
      nombres: 'Fernando',
      apellidos: 'Quispe Mamani',
      caso: 'Llega a 140 créditos solo con los cursos en curso → DER349 CONDICIONAL',
      historial: [...base(6, ['1HUM02', '1SOC01', '1TEO01']), ...cicloEnCurso(7)],
    },
    {
      codigo: '20180707',
      nombres: 'Gabriela',
      apellidos: 'Mendoza Chávez',
      caso: 'Último ciclo: apta para casi todo (1INF41 jalado y en curso)',
      historial: [
        ...base(9, ['1HIS02', '1PSI04', 'CDR121'], ['1INF41']),
        nota('1INF41', 10),
        ...enCurso('1INF41'),
        ...cicloEnCurso(10),
      ],
    },
    {
      codigo: '20190808',
      nombres: 'Hugo',
      apellidos: 'Paredes Lazo',
      caso: 'Ciclo 9: ya aprobó INF310 y lleva INF356 (etiquetas informativas)',
      historial: [
        ...base(8, ['1EGC02', '1LIT16', '1TEO02']),
        nota('INF310', 15),
        ...cicloEnCurso(9),
        ...enCurso('INF356'),
      ],
    },
    {
      codigo: '20210909',
      nombres: 'Isabel',
      apellidos: 'Cárdenas Soto',
      caso: 'Ciclo 6 con un curso de otra facultad (TEL618: 0 créditos) y un electivo libre',
      historial: [
        ...base(5, ['1HUM02', '1PSI04', '1CDR01']),
        nota('TEL618', 16),
        nota('1HUM74', 15),
        ...cicloEnCurso(6),
      ],
    },
    {
      codigo: '20201010',
      nombres: 'Jorge',
      apellidos: 'Villanueva Rojas',
      caso: 'Ciclo 8, línea de seguridad: 1INF39 y 1INF41 en curso',
      historial: [...base(7, ['1HIS03', '1ANT01', 'TEO111']), ...enCurso('1INF39', '1INF41', '1INF65', '1INF37')],
    },
    {
      codigo: '20221111',
      nombres: 'Karen',
      apellidos: 'Espinoza Díaz',
      caso: 'Ciclo 3: ningún electivo apto',
      historial: [...base(2, ['1PSI03', '1PSI04', '1TEO01']), ...cicloEnCurso(3)],
    },
    {
      codigo: '20201212',
      nombres: 'Luis',
      apellidos: 'Gutiérrez Núñez',
      caso: 'INF238 desaprobado (10) y no lo lleva → [INF238] NO_APTO',
      historial: [
        ...base(7, ['1HUM02', '1SOC01', '1TEO03'], ['INF238']),
        nota('INF238', 10),
        ...enCurso('1INF39', '1INF65'),
      ],
    },
    {
      codigo: '20181515',
      nombres: 'Olga',
      apellidos: 'Ramírez León',
      caso: 'Ciclo 10 con 15 créditos de libre disponibilidad (cuentan solo 12)',
      historial: [
        ...base(9, ['1EGC01', '1EGC04', '1TEO03']),
        ...['1HUM74', '1HUM75', '1HUM78', '1HUM79', 'TEO240'].map((c) => nota(c, notaAprobada())),
        ...cicloEnCurso(10),
      ],
    },
    {
      codigo: '20231414',
      nombres: 'Nicolás',
      apellidos: 'Herrera Campos',
      caso: 'Sin historial cargado (aparece como aviso en el panel)',
      historial: [],
    },
  ];

  const cuentas = await hashearCuentas(
    alumnos.map((a) => ({
      codigo: a.codigo,
      nombres: a.nombres,
      apellidos: a.apellidos,
      correo: `a${a.codigo}@pucp.edu.pe`,
      password: PASSWORD_ALUMNOS,
    })),
  );
  await prisma.$transaction((tx) => aplicarCuentas(tx, proceso.id, cuentas), { timeout: 60_000 });

  const items: HistorialImportado[] = alumnos.flatMap((a) =>
    a.historial.map((f) => ({ codigoAlumno: a.codigo, codigoCurso: f.curso, nota: f.nota })),
  );
  await prisma.$transaction((tx) => aplicarHistorial(tx, proceso.id, items), { timeout: 60_000 });
  console.log(`✔ ${alumnos.length} alumnos (contraseña: ${PASSWORD_ALUMNOS}) y ${items.length} filas de historial`);

  // ---------- Votos de ejemplo ----------
  const elegibilidad = new ElegibilidadService(new ElegibilidadRepository(prisma as unknown as PrismaService));
  const catalogo = await elegibilidad.cargarCatalogo();
  const votosPlan: Record<string, [string, Franja[]][]> = {
    '20180707': [
      ['1INF02', ['NOCHE']],
      ['1INF52', ['NOCHE', 'TARDE']],
      ['1INF59', ['TARDE']],
      ['INF340', ['NOCHE']],
      ['1INF20', ['MEDIODIA', 'NOCHE']],
    ],
    '20190808': [
      ['1INF02', ['TARDE', 'NOCHE']],
      ['INF384', ['MEDIA_MANANA']],
      ['INF373', ['MANANA']],
    ],
    '20190505': [
      ['1INF02', ['MEDIA_MANANA']],
      ['1INF52', ['MEDIA_MANANA', 'MEDIODIA']],
    ],
    '20200303': [
      ['1INF02', ['NOCHE']],
      ['1INF59', ['NOCHE', 'TARDE']],
    ],
    '20190606': [
      ['DER349', ['TARDE']],
      ['1IND40', ['MANANA']],
    ],
    '20201010': [
      ['1INF20', ['NOCHE']],
      ['INF275', ['TARDE', 'NOCHE']],
    ],
    '20195678': [
      ['1INF02', ['TARDE']],
      ['INF356', ['NOCHE']],
    ],
    '20181515': [
      ['INF340', ['MEDIA_MANANA']],
      ['1INF02', ['MEDIA_MANANA']],
      ['CIC611', ['MANANA', 'MEDIA_MANANA']],
    ],
  };

  let totalVotos = 0;
  for (const [codigo, votos] of Object.entries(votosPlan)) {
    const usuario = await prisma.usuario.findUniqueOrThrow({ where: { codigo } });
    const { contexto } = await elegibilidad.contextoAlumno(proceso.id, usuario.id, catalogo);
    await prisma.aceptacionTerminos.create({
      data: { procesoId: proceso.id, usuarioId: usuario.id, version: TERMINOS_VERSION },
    });
    for (const [cursoCodigo, franjas] of votos) {
      const electivo = catalogo.electivos.find((e) => e.codigo === cursoCodigo)!;
      const { aptitud } = elegibilidad.evaluar(electivo, contexto).elegibilidad;
      if (aptitud === 'NO_APTO') {
        console.warn(`  (se omite el voto de ${codigo} por ${cursoCodigo}: NO_APTO)`);
        continue;
      }
      await prisma.voto.create({
        data: {
          procesoId: proceso.id,
          usuarioId: usuario.id,
          cursoCodigo,
          aptitud,
          franjas: { create: franjas.map((franja) => ({ franja })) },
        },
      });
      totalVotos++;
    }
  }
  console.log(`✔ ${totalVotos} votos de ejemplo`);

  console.log('\nCasos cubiertos por los alumnos sintéticos:');
  for (const a of alumnos) console.log(`  ${a.codigo}  ${a.nombres} ${a.apellidos} — ${a.caso}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
