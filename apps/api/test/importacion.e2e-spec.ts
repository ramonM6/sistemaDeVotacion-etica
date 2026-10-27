import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import request from 'supertest';
import { Escenario, PASSWORD, crearApp, escenarioBase, sesion, voto, xlsx } from './utils';

const PLANTILLAS = resolve(__dirname, '../../../docs/plantillas');
type Agente = Awaited<ReturnType<typeof sesion>>;

describe('Importación y exportación (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let esc: Escenario;
  let coord: Agente;

  beforeAll(async () => {
    prisma = new PrismaClient();
    app = await crearApp();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    esc = await escenarioBase(prisma);
    await prisma.procesoVotacion.update({
      where: { id: esc.procesoId },
      data: { estado: 'BORRADOR', primeraApertura: null },
    });
    coord = await sesion(app, process.env.COORD_USER!, process.env.COORD_PASSWORD!);
  });

  const subir = (tipo: string, archivo: Buffer, nombre = 'archivo.xlsx') =>
    coord.post(`/api/coord/import/${tipo}/preview`).attach('archivo', archivo, nombre);

  describe('catálogo', () => {
    it('la plantilla oficial pasa sin errores: 148 cursos y 54 electivos', async () => {
      const res = await subir('catalogo', readFileSync(resolve(PLANTILLAS, 'plantilla_malla_curricular.xlsx')));
      expect(res.status).toBe(200);
      expect(res.body.resumen).toEqual({ total: 148, validas: 148, conErrores: 0, conAdvertencias: 0 });
      expect(res.body.token).toEqual(expect.any(String));
      expect(res.body.filas.filter((f: any) => f.datos.tipo === 'ELECTIVO')).toHaveLength(54);

      const conf = await coord.post('/api/coord/import/catalogo/confirmar').send({ token: res.body.token });
      expect(conf.status).toBe(200);
      expect(await prisma.curso.count()).toBe(148);
      expect(await prisma.curso.count({ where: { tipo: 'ELECTIVO' } })).toBe(54);
      // Solo los ELECTIVO tienen requisitos parseados
      const conRequisitos = await prisma.requisito.findMany({ distinct: ['cursoCodigo'], include: { curso: true } });
      expect(conRequisitos.every((r) => r.curso.tipo === 'ELECTIVO')).toBe(true);
    });

    it('muestra errores por fila y no guarda nada (sin token) si hay errores', async () => {
      const archivo = await xlsx('cursos', [
        ['codigo', 'nombre', 'creditos', 'tipo', 'ciclo', 'grupo', 'requisitos', 'descripcion'],
        ['1INF02', 'Aprendizaje de Máquina', 3.5, 'ELECTIVO', null, null, '1INF24', null],
        ['1INF99', 'Curso con requisito mal escrito', 3, 'ELECTIVO', null, null, '1INF24 y 1INF41', null],
        ['1INF02', 'Duplicado', 3, 'ELECTIVO', null, null, null, null],
        ['XX', '', -1, 'OPTATIVO', 11, null, null, null],
        ['1HUM02', 'Ética', 2, 'ELECTIVO_GENERALES', 2, 'EH1', null, null],
        ['1INF70', 'Con requisito externo', 3.5, 'ELECTIVO', null, null, 'TEL618', null],
      ]);
      const res = await subir('catalogo', archivo);
      expect(res.status).toBe(200);
      expect(res.body.token).toBeNull();
      expect(res.body.resumen).toMatchObject({ total: 6, conErrores: 3 });
      const fila = (n: number) => res.body.filas.find((f: any) => f.fila === n);
      expect(fila(2).errores).toEqual([]);
      expect(fila(3).errores[0]).toMatch(/no reconocido/);
      expect(fila(4).errores[0]).toMatch(/duplicado/i);
      expect(fila(5).errores.length).toBeGreaterThanOrEqual(4);
      expect(fila(7).advertencias[0]).toMatch(/TEL618/);
      expect(await prisma.curso.findUnique({ where: { codigo: '1INF99' } })).toBeNull();
    });

    it('al reimportar no borra la descripción editada si la celda viene vacía', async () => {
      await coord.patch('/api/coord/cursos/INF310').send({ descripcion: 'Editada en el sistema' }).expect(200);
      const archivo = await xlsx('cursos', [
        ['codigo', 'nombre', 'creditos', 'tipo', 'requisitos', 'descripcion'],
        ['INF310', 'Teoría de Grafos', 3, 'ELECTIVO', null, null],
        ['1INF02', 'Aprendizaje de Máquina', 3.5, 'ELECTIVO', '1INF24', 'Nueva descripción'],
        ['1INF24', 'Inteligencia Artificial', 3.5, 'OBLIGATORIO', '1INF32', null],
      ]);
      const res = await subir('catalogo', archivo);
      await coord.post('/api/coord/import/catalogo/confirmar').send({ token: res.body.token }).expect(200);
      expect((await prisma.curso.findUniqueOrThrow({ where: { codigo: 'INF310' } })).descripcion).toBe(
        'Editada en el sistema',
      );
      expect((await prisma.curso.findUniqueOrThrow({ where: { codigo: '1INF02' } })).descripcion).toBe(
        'Nueva descripción',
      );
      // los cursos que ya no vienen en el archivo se eliminan
      expect(await prisma.curso.findUnique({ where: { codigo: 'INF356' } })).toBeNull();
    });

    it('conserva (con advertencia) los cursos con votos que no vienen en el archivo', async () => {
      await prisma.procesoVotacion.update({ where: { id: esc.procesoId }, data: { estado: 'ABIERTO' } });

      const alumno = await sesion(app, '20000001');
      await alumno
        .post('/api/alumno/votos')
        .send(voto('INF356', ['NOCHE']))
        .expect(201);
      const archivo = await xlsx('cursos', [
        ['codigo', 'nombre', 'creditos', 'tipo'],
        ['INF310', 'Teoría de Grafos', 3, 'ELECTIVO'],
      ]);
      const res = await subir('catalogo', archivo);
      expect(res.body.advertenciasGenerales.join(' ')).toMatch(/INF356/);
      await coord.post('/api/coord/import/catalogo/confirmar').send({ token: res.body.token }).expect(200);
      expect(await prisma.curso.findUnique({ where: { codigo: 'INF356' } })).not.toBeNull();
    });
  });

  describe('cuentas', () => {
    it('crea cuentas globales sin reemplazar padrones y sin devolver contraseñas', async () => {
      const res = await subir('cuentas', readFileSync(resolve(PLANTILLAS, 'plantilla_cuentas_alumnos.xlsx')));
      expect(res.body.resumen).toMatchObject({ total: 2, validas: 2, conErrores: 0 });
      expect(JSON.stringify(res.body)).not.toContain('Temporal#2026');
      await coord.post('/api/coord/import/cuentas/confirmar').send({ token: res.body.token }).expect(200);
      expect((await prisma.usuario.findUniqueOrThrow({ where: { codigo: '20201234' } })).passwordHash).toMatch(
        /^\$2[aby]\$10\$/,
      );
      expect(await prisma.padronAlumno.count({ where: { procesoId: esc.procesoId } })).toBe(4);
      const alumno = await sesion(app, '20201234', 'Temporal#2026');
      expect((await alumno.get('/api/alumno/procesos')).body).toEqual([]);
      await sesion(app, '20000001');
      const listado = await coord.get('/api/coord/import/alumnos').expect(200);
      expect(JSON.stringify(listado.body)).not.toMatch(/password|Temporal#2026/);
    });

    it('valida código de 8 dígitos, duplicados, campos obligatorios y contraseña mínima', async () => {
      const archivo = await xlsx('alumnos', [
        ['codigo', 'nombres', 'apellidos', 'correo', 'password'],
        [20201234, 'Ana', 'Pérez', 'ana@pucp.edu.pe', 'Clave#2026'],
        ['2020123', 'Beto', 'Ruiz', null, 'Clave#2026'],
        ['20201234', 'Duplicado', 'X', null, 'Clave#2026'],
        ['20209999', '', 'Sin nombre', 'correo-malo', 'corta'],
      ]);
      const res = await subir('cuentas', archivo);
      expect(res.body.token).toBeNull();
      expect(res.body.filas.map((f: any) => f.errores.length > 0)).toEqual([false, true, true, true]);
      expect(res.body.filas[3].advertencias[0]).toMatch(/correo/i);
      // un código numérico en Excel se lee como texto
      expect(res.body.filas[0].datos.codigo).toBe('20201234');
    });
  });

  describe('historial', () => {
    it('advierte los cursos fuera del catálogo, da error si el alumno no está en cuentas y acepta nota vacía', async () => {
      const archivo = await xlsx('historial', [
        ['codigo_alumno', 'codigo_curso', 'nota'],
        ['20000003', '1INF24', 9],
        ['20000003', '1INF24', 15],
        ['20000003', '1INF41', null],
        ['20000003', 'TEL618', 16],
        ['20000099', '1INF24', 14],
        ['20000003', 'BLOQUE', 21],
        ['20000003', 'BLOQUE', 12.5],
      ]);
      const res = await subir('historial', archivo);
      expect(res.body.token).toBeNull();
      const f = res.body.filas;
      expect(f[2].datos.nota).toBeNull();
      expect(f[3].advertencias[0]).toMatch(/0 créditos/);
      expect(f[4].errores[0]).toMatch(/cuenta registrada/);
      expect(f[5].errores[0]).toMatch(/Nota/);
      expect(f[6].errores[0]).toMatch(/Nota/);
    });

    it('al confirmar reemplaza el historial del proceso y cambia la aptitud', async () => {
      const archivo = await xlsx('historial', [
        ['codigo_alumno', 'codigo_curso', 'nota'],
        ['20000003', '1INF24', 9],
        ['20000003', '1INF24', 15],
      ]);
      const res = await subir('historial', archivo);
      expect(res.body.resumen.conErrores).toBe(0);
      await coord.post('/api/coord/import/historial/confirmar').send({ token: res.body.token }).expect(200);
      expect(await prisma.historialItem.count({ where: { procesoId: esc.procesoId } })).toBe(2);

      const detalle = await coord.get('/api/coord/padron/20000003');
      expect(detalle.body.electivos.find((e: any) => e.codigo === '1INF02').elegibilidad.aptitud).toBe('CONFIRMADO');
    });

    it('un token sirve una sola vez y solo para su tipo', async () => {
      const archivo = await xlsx('historial', [
        ['codigo_alumno', 'codigo_curso', 'nota'],
        ['20000003', '1INF24', 15],
      ]);
      const { body } = await subir('historial', archivo);
      await coord.post('/api/coord/import/catalogo/confirmar').send({ token: body.token }).expect(400);
      await coord.post('/api/coord/import/historial/confirmar').send({ token: body.token }).expect(200);
      await coord.post('/api/coord/import/historial/confirmar').send({ token: body.token }).expect(400);
    });
  });

  describe('validación del archivo', () => {
    it('rechaza extensiones distintas de .xlsx y .csv', async () => {
      const res = await subir('historial', Buffer.from('codigo_alumno,codigo_curso\n20000003,1INF24'), 'historial.txt');
      expect(res.status).toBe(400);
    });

    it('rechaza archivos de más de 5 MB', async () => {
      const res = await subir('historial', Buffer.alloc(5 * 1024 * 1024 + 10, 1), 'grande.xlsx');
      expect(res.status).toBe(413);
    });

    it('un .xlsx corrupto o sin las columnas obligatorias da error general', async () => {
      const corrupto = await subir('historial', Buffer.from('no es un excel'), 'x.xlsx');
      expect(corrupto.body.erroresGenerales[0]).toMatch(/no es un Excel/);
      const sinColumnas = await subir(
        'historial',
        await xlsx('historial', [
          ['alumno', 'curso'],
          ['1', '2'],
        ]),
      );
      expect(sinColumnas.body.erroresGenerales[0]).toMatch(/Faltan columnas/);
      expect(sinColumnas.body.token).toBeNull();
    });

    it('nunca evalúa fórmulas: usa el valor guardado en el archivo', async () => {
      const libro = new ExcelJS.Workbook();
      const hoja = libro.addWorksheet('historial');
      hoja.addRow(['codigo_alumno', 'codigo_curso', 'nota']);
      hoja.addRow(['20000003', '1INF24', { formula: '10+10', result: 14 }]);
      const res = await subir('historial', Buffer.from(await libro.xlsx.writeBuffer()));
      expect(res.body.filas[0].datos.nota).toBe(14);
    });

    it('un alumno no puede importar', async () => {
      await prisma.procesoVotacion.update({ where: { id: esc.procesoId }, data: { estado: 'ABIERTO' } });
      const alumno = await sesion(app, '20000001');
      const res = await alumno
        .post('/api/coord/import/historial/preview')
        .attach('archivo', Buffer.from('x'), 'x.xlsx');
      expect(res.status).toBe(403);
    });
  });

  it('la matriz curso × franja del dashboard coincide con la exportación a Excel', async () => {
    await prisma.procesoVotacion.update({ where: { id: esc.procesoId }, data: { estado: 'ABIERTO' } });
    const votos: [string, [string, string[]][]][] = [
      [
        '20000001',
        [
          ['1INF02', ['NOCHE', 'TARDE']],
          ['INF310', ['MANANA']],
          ['DER349', ['NOCHE']],
        ],
      ],
      [
        '20000002',
        [
          ['1INF02', ['NOCHE']],
          ['INF310', ['MANANA', 'MEDIODIA']],
        ],
      ],
      ['20000004', [['1INF02', ['MEDIA_MANANA']]]],
    ];
    for (const [codigo, lista] of votos) {
      const alumno = await sesion(app, codigo);
      for (const [c, f] of lista) await alumno.post('/api/alumno/votos').send(voto(c, f)).expect(201);
    }

    const { body } = await coord.get('/api/coord/resultados');
    const res = await coord
      .get('/api/coord/export/resultados.xlsx')
      .buffer(true)
      .parse((r, cb) => {
        const partes: Buffer[] = [];
        r.on('data', (d: Buffer) => partes.push(d));
        r.on('end', () => cb(null, Buffer.concat(partes)));
      });
    expect(res.status).toBe(200);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(res.body);
    expect(libro.worksheets.map((h) => h.name)).toEqual(['Ranking', 'Matriz franjas']);

    const matriz: Record<string, number[]> = {};
    libro.getWorksheet('Matriz franjas')!.eachRow((fila, n) => {
      if (n === 1) return;
      const v = fila.values as unknown[];
      matriz[String(v[1])] = v.slice(3, 9).map(Number); // 5 franjas + total
    });
    const esperado = Object.fromEntries(
      body.ranking.map((f: any) => [
        f.codigo,
        [f.franjas.MANANA, f.franjas.MEDIA_MANANA, f.franjas.MEDIODIA, f.franjas.TARDE, f.franjas.NOCHE, f.total],
      ]),
    );
    expect(matriz).toEqual(esperado);
    expect(matriz['1INF02']).toEqual([0, 1, 0, 1, 2, 3]);
    expect(libro.getWorksheet('Votos detallados')).toBeUndefined();
  });
});
