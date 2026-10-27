import * as ExcelJS from 'exceljs';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { crearApp, escenarioBase, Escenario, sesion, aceptarTerminos, voto, xlsx } from './utils';
import { parsearRequisitos } from '../src/modules/elegibilidad/motor';

describe('Requisitos integrados de VotaInf', () => {
  let app: INestApplication, db: PrismaClient, esc: Escenario;
  let coord: Awaited<ReturnType<typeof sesion>>;
  beforeAll(async () => {
    db = new PrismaClient();
    app = await crearApp();
  });
  afterAll(async () => {
    await app.close();
    await db.$disconnect();
  });
  beforeEach(async () => {
    esc = await escenarioBase(db);
    coord = await sesion(app, process.env.COORD_USER!, process.env.COORD_PASSWORD!);
  });
  const cerrar = () => coord.patch(`/api/coord/procesos/${esc.procesoId}/estado`).send({ estado: 'CERRADO' });

  it('rechaza límites superiores a 5 electivos y 2 franjas', async () => {
    await coord.patch(`/api/coord/procesos/${esc.procesoId}`).send({ maxCursos: 6 }).expect(400);
    await coord.patch(`/api/coord/procesos/${esc.procesoId}`).send({ maxFranjas: 3 }).expect(400);
  });

  it('oculta resultados al reabrir y conserva los votos', async () => {
    await aceptarTerminos(db, esc.procesoId, esc.alumnos['20000001']);
    const alumno = await sesion(app, '20000001');
    await alumno
      .post('/api/alumno/votos')
      .send(voto('INF310', ['NOCHE']))
      .expect(201);
    await cerrar().expect(200);
    expect((await alumno.get('/api/resultados/publicos')).body.totalVotos).toBe(1);
    await coord.patch(`/api/coord/procesos/${esc.procesoId}/estado`).send({ estado: 'ABIERTO' }).expect(200);
    expect((await alumno.get('/api/resultados/publicos')).body.ranking).toEqual([]);
    expect(await db.voto.count()).toBe(1);
  });

  it('añade dependencias simultáneas atómicamente y las retira en cascada', async () => {
    await db.requisito.createMany({
      data: parsearRequisitos('[INF356]').terminos.map((t) => ({
        cursoCodigo: 'INF310',
        texto: t.texto,
        tipo: t.tipo,
        cursoRequerido: t.cursoRequerido,
      })),
    });
    await aceptarTerminos(db, esc.procesoId, esc.alumnos['20000003']);
    const alumno = await sesion(app, '20000003');
    const detalle = await alumno.get('/api/alumno/electivos/INF310');
    expect(detalle.body.dependencias).toEqual(['INF356']);
    await alumno
      .post('/api/alumno/votos')
      .send(voto('INF310', ['NOCHE']))
      .expect(201);
    expect(await db.voto.count()).toBe(2);
    await alumno.delete('/api/alumno/votos/INF356').expect(200);
    expect(await db.voto.count()).toBe(0);
  });

  it('no guarda parcialmente un paquete que supera el límite de cursos', async () => {
    await db.procesoVotacion.update({ where: { id: esc.procesoId }, data: { maxCursos: 1 } });
    await db.requisito.create({
      data: { cursoCodigo: 'INF310', texto: '[INF356]', tipo: 'APROBADO_O_SIMULTANEO', cursoRequerido: 'INF356' },
    });
    await aceptarTerminos(db, esc.procesoId, esc.alumnos['20000003']);
    const alumno = await sesion(app, '20000003');
    await alumno
      .post('/api/alumno/votos')
      .send(voto('INF310', ['NOCHE']))
      .expect(400);
    expect(await db.voto.count()).toBe(0);
  });

  it('valida seguimiento solo al cierre y bloquea reapertura después de las decisiones', async () => {
    await coord.patch('/api/coord/seguimiento/INF310').send({ seleccion: 'SELECCIONADO_PARA_REVISION' }).expect(400);
    await cerrar().expect(200);
    await coord.patch('/api/coord/seguimiento/INF310').send({ dictado: 'CONFIRMADO' }).expect(400);
    await coord
      .patch('/api/coord/seguimiento/INF310')
      .send({ seleccion: 'SELECCIONADO_PARA_REVISION', consejo: 'APROBADO', dictado: 'CONFIRMADO' })
      .expect(200);
    await coord.patch(`/api/coord/procesos/${esc.procesoId}/estado`).send({ estado: 'ABIERTO' }).expect(400);
    const alumno = await sesion(app, '20000001');
    await alumno.get('/api/coord/seguimiento').expect(403);
  });

  it('previsualiza CSV sin escribir y confirma decisiones de forma transaccional', async () => {
    await cerrar().expect(200);
    await coord.patch('/api/coord/seguimiento/INF310').send({ seleccion: 'SELECCIONADO_PARA_REVISION' }).expect(200);
    const csv = 'codigo,consejo,dictado,observacion\nINF310,APROBADO,CONFIRMADO,"Aprobado, acta 1"';
    await coord.post('/api/coord/seguimiento/csv/preview').send({ csv }).expect(201);
    expect((await db.seguimientoCurso.findFirstOrThrow()).consejo).toBe('PENDIENTE');
    await coord.post('/api/coord/seguimiento/csv/confirmar').send({ csv }).expect(201);
    expect((await db.seguimientoCurso.findFirstOrThrow()).observacion).toBe('Aprobado, acta 1');
    await coord
      .post('/api/coord/seguimiento/csv/confirmar')
      .send({ csv: csv + '\nZZZ999,APROBADO,CONFIRMADO,Error' })
      .expect(400);
    expect(await db.seguimientoCurso.count()).toBe(1);
  });

  it('filtra ranking e indicadores solo por aptitud y elimina las agrupaciones', async () => {
    await aceptarTerminos(db, esc.procesoId, esc.alumnos['20000001']);
    await aceptarTerminos(db, esc.procesoId, esc.alumnos['20000002']);
    const a = await sesion(app, '20000001');
    const b = await sesion(app, '20000002');
    await a
      .post('/api/alumno/votos')
      .send(voto('1INF02', ['MANANA']))
      .expect(201);
    await b
      .post('/api/alumno/votos')
      .send(voto('1INF02', ['NOCHE']))
      .expect(201);
    const todos = await coord.get('/api/coord/resultados').expect(200);
    expect(todos.body.indicadores.totalVotos).toBe(2);
    expect(todos.body).not.toHaveProperty('agrupaciones');
    expect(todos.body).not.toHaveProperty('filtros');
    for (const aptitud of ['CONFIRMADO', 'CONDICIONAL']) {
      const res = await coord.get(`/api/coord/resultados?aptitud=${aptitud}`).expect(200);
      expect(res.body.indicadores.totalVotos).toBe(1);
      expect(res.body.ranking[0]).toMatchObject({
        total: 1,
        confirmados: aptitud === 'CONFIRMADO' ? 1 : 0,
        condicionales: aptitud === 'CONDICIONAL' ? 1 : 0,
      });
      expect(res.body.ranking[0].franjas).toMatchObject({
        MANANA: aptitud === 'CONFIRMADO' ? 1 : 0,
        NOCHE: aptitud === 'CONDICIONAL' ? 1 : 0,
      });
    }
    await coord.get('/api/coord/resultados?ingreso=2020').expect(400);
  });

  it('la exportación de datos respeta el filtro de aptitud y exige rol coordinador', async () => {
    await aceptarTerminos(db, esc.procesoId, esc.alumnos['20000001']);
    await aceptarTerminos(db, esc.procesoId, esc.alumnos['20000002']);
    const a = await sesion(app, '20000001');
    const b = await sesion(app, '20000002');
    await a
      .post('/api/alumno/votos')
      .send(voto('1INF02', ['MANANA']))
      .expect(201);
    await b
      .post('/api/alumno/votos')
      .send(voto('1INF02', ['NOCHE']))
      .expect(201);
    const res = await coord
      .get('/api/coord/export/resultados.xlsx?aptitud=CONDICIONAL')
      .buffer(true)
      .parse((r, cb) => {
        const partes: Buffer[] = [];
        r.on('data', (d) => partes.push(d));
        r.on('end', () => cb(null, Buffer.concat(partes)));
      })
      .expect(200);
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(res.body);
    expect(libro.getWorksheet('Ranking')!.getRow(2).getCell(5).value).toBe(1);
    expect(libro.getWorksheet('Matriz franjas')!.getRow(2).getCell(3).value).toBe(0);
    expect(libro.getWorksheet('Matriz franjas')!.getRow(2).getCell(7).value).toBe(1);
    await a.get('/api/coord/export/resultados.xlsx').expect(403);
  });

  it('congela catálogo y datos académicos desde la primera apertura', async () => {
    await cerrar().expect(200);
    await coord.patch(`/api/coord/procesos/${esc.procesoId}/estado`).send({ estado: 'ABIERTO' }).expect(200);
    await coord.patch('/api/coord/cursos/INF310').send({ requisitosTexto: '1INF41' }).expect(200);
    const alumno = await sesion(app, '20000003');
    expect((await alumno.get('/api/alumno/electivos/INF310')).body.elegibilidad.aptitud).toBe('CONFIRMADO');
    const archivo = await xlsx('historial', [
      ['codigo_alumno', 'codigo_curso', 'nota'],
      ['20000003', '1INF41', 15],
    ]);
    await coord.post('/api/coord/import/historial/preview').attach('archivo', archivo, 'historial.xlsx').expect(400);
  });
  it('importa CSV y conserva el original cifrado con descarga restringida', async () => {
    await db.procesoVotacion.update({ where: { id: esc.procesoId }, data: { estado: 'BORRADOR' } });
    const csv = Buffer.from('codigo_alumno,codigo_curso,nota\n20000003,1INF24,15');
    const preview = await coord
      .post('/api/coord/import/historial/preview')
      .attach('archivo', csv, 'historial.csv')
      .expect(200);
    expect(preview.body.resumen.conErrores).toBe(0);
    await coord.post('/api/coord/import/historial/confirmar').send({ token: preview.body.token }).expect(200);
    const archivo = await db.archivoCarga.findFirstOrThrow();
    expect(Buffer.from(archivo.contenido).includes(csv)).toBe(false);
    const lista = await coord.get('/api/coord/import/archivos').expect(200);
    expect(lista.body[0]).toMatchObject({ nombre: 'historial.csv', filas: 1 });
    expect(lista.body[0]).not.toHaveProperty('contenido');
    const original = await coord
      .get(`/api/coord/import/archivos/${archivo.id}`)
      .buffer(true)
      .parse((r, cb) => {
        const partes: Buffer[] = [];
        r.on('data', (d) => partes.push(d));
        r.on('end', () => cb(null, Buffer.concat(partes)));
      })
      .expect(200);
    expect(original.body).toEqual(csv);
    const alumno = await sesion(app, '20000001');
    await alumno.get(`/api/coord/import/archivos/${archivo.id}`).expect(403);
  });

  it('reutiliza el catálogo de un proceso anterior en un nuevo borrador', async () => {
    await cerrar().expect(200);
    await coord.patch(`/api/coord/procesos/${esc.procesoId}/estado`).send({ estado: 'ABIERTO' }).expect(200);
    await cerrar().expect(200);
    const nuevo = await coord
      .post('/api/coord/procesos')
      .send({
        nombre: 'Nuevo proceso',
        cicloActual: '2026-2',
        cicloObjetivo: '2027-1',
        fechaInicio: new Date().toISOString(),
        fechaFin: new Date(Date.now() + 86400000).toISOString(),
      })
      .expect(201);
    await coord
      .post(`/api/coord/procesos/${nuevo.body.id}/reutilizar-catalogo`)
      .send({ origenId: esc.procesoId })
      .expect(201);
    const copia = await db.procesoVotacion.findUniqueOrThrow({ where: { id: nuevo.body.id } });
    expect(copia.catalogo).toEqual(
      (await db.procesoVotacion.findUniqueOrThrow({ where: { id: esc.procesoId } })).catalogo,
    );
  });

  it('mantiene el límite por cantidad de electivos sin imponer 28 créditos', async () => {
    await aceptarTerminos(db, esc.procesoId, esc.alumnos['20000003']);
    const alumno = await sesion(app, '20000003');
    for (let i = 0; i < 5; i++) {
      const codigo = `INF90${i}`;
      await db.curso.create({ data: { codigo, nombre: `Electivo ${i}`, creditos: 10, tipo: 'ELECTIVO' } });
      await alumno
        .post('/api/alumno/votos')
        .send(voto(codigo, ['MANANA', 'NOCHE']))
        .expect(201);
    }
    expect(
      (await alumno.get('/api/alumno/votos')).body.reduce((s: number, v: { creditos: number }) => s + v.creditos, 0),
    ).toBe(50);
    await alumno
      .post('/api/alumno/votos')
      .send(voto('INF310', ['NOCHE']))
      .expect(400);
  });

  it('no permite votar por un curso aprobado o que ya se está llevando', async () => {
    await db.historialItem.create({
      data: { procesoId: esc.procesoId, usuarioId: esc.alumnos['20000003'], cursoCodigo: 'INF310', nota: 15 },
    });
    await aceptarTerminos(db, esc.procesoId, esc.alumnos['20000003']);
    const alumno = await sesion(app, '20000003');
    await alumno
      .post('/api/alumno/votos')
      .send(voto('INF310', ['NOCHE']))
      .expect(403);
    await db.historialItem.updateMany({ where: { cursoCodigo: 'INF310' }, data: { nota: null } });
    await alumno
      .post('/api/alumno/votos')
      .send(voto('INF310', ['NOCHE']))
      .expect(403);
  });
  it('una recarga del catálogo no mezcla los cursos históricos con una nueva oferta', async () => {
    await cerrar().expect(200);
    await coord.patch(`/api/coord/procesos/${esc.procesoId}/estado`).send({ estado: 'ABIERTO' }).expect(200);
    const csv = Buffer.from('codigo,nombre,creditos,tipo\nINF310,Teoria de Grafos,3,ELECTIVO');
    const preview = await coord
      .post('/api/coord/import/catalogo/preview')
      .attach('archivo', csv, 'catalogo.csv')
      .expect(200);
    await coord.post('/api/coord/import/catalogo/confirmar').send({ token: preview.body.token }).expect(200);
    expect(await db.curso.count({ where: { activo: true } })).toBe(1);
    const alumno = await sesion(app, '20000001');
    expect((await alumno.get('/api/alumno/electivos')).body.electivos).toHaveLength(7);
    await cerrar().expect(200);
    const nuevo = await coord
      .post('/api/coord/procesos')
      .send({
        nombre: 'Oferta siguiente',
        cicloObjetivo: '2027-2',
        fechaInicio: new Date().toISOString(),
        fechaFin: new Date(Date.now() + 86400000).toISOString(),
      })
      .expect(201);
    await coord.patch(`/api/coord/procesos/${nuevo.body.id}/estado`).send({ estado: 'ABIERTO' }).expect(200);
    const guardado = await db.procesoVotacion.findUniqueOrThrow({ where: { id: nuevo.body.id } });
    expect((guardado.catalogo as { codigo: string }[]).map((c) => c.codigo)).toEqual(['INF310']);
  });
  it('al cambiar una decisión previa limpia los estados posteriores del curso', async () => {
    await cerrar().expect(200);
    await coord
      .patch('/api/coord/seguimiento/INF310')
      .send({ seleccion: 'SELECCIONADO_PARA_REVISION', consejo: 'APROBADO', dictado: 'CONFIRMADO' })
      .expect(200);
    await coord.patch('/api/coord/seguimiento/INF310').send({ seleccion: 'NO_SELECCIONADO' }).expect(200);
    let decision = await db.seguimientoCurso.findFirstOrThrow();
    expect(decision).toMatchObject({ seleccion: 'NO_SELECCIONADO', consejo: 'PENDIENTE', dictado: 'PENDIENTE' });
    await coord
      .patch('/api/coord/seguimiento/INF310')
      .send({ seleccion: 'SELECCIONADO_PARA_REVISION', consejo: 'APROBADO', dictado: 'CONFIRMADO' })
      .expect(200);
    await coord.patch('/api/coord/seguimiento/INF310').send({ consejo: 'NO_APROBADO' }).expect(200);
    decision = await db.seguimientoCurso.findFirstOrThrow();
    expect(decision).toMatchObject({
      seleccion: 'SELECCIONADO_PARA_REVISION',
      consejo: 'NO_APROBADO',
      dictado: 'PENDIENTE',
    });
    await coord.patch('/api/coord/seguimiento/INF310').send({ dictado: 'NO_SE_DICTARA' }).expect(400);
  });

  it('los estados se guardan en la votación elegida sin modificar otra votación', async () => {
    await cerrar().expect(200);
    const otro = await db.procesoVotacion.create({
      data: {
        nombre: 'Otra votación cerrada',
        cicloObjetivo: '2027-2',
        estado: 'CERRADO',
        fechaInicio: new Date(Date.now() - 86400000),
        fechaFin: new Date(Date.now() + 86400000),
      },
    });
    await coord
      .patch(`/api/coord/seguimiento/INF310?procesoId=${esc.procesoId}`)
      .send({ seleccion: 'SELECCIONADO_PARA_REVISION' })
      .expect(200);
    await coord
      .patch(`/api/coord/seguimiento/INF310?procesoId=${otro.id}`)
      .send({ seleccion: 'NO_SELECCIONADO' })
      .expect(200);
    const primera = await coord.get(`/api/coord/seguimiento?procesoId=${esc.procesoId}`).expect(200);
    const segunda = await coord.get(`/api/coord/seguimiento?procesoId=${otro.id}`).expect(200);
    expect(primera.body.cursos.find((c: { codigo: string }) => c.codigo === 'INF310').seleccion).toBe(
      'SELECCIONADO_PARA_REVISION',
    );
    expect(segunda.body.cursos.find((c: { codigo: string }) => c.codigo === 'INF310').seleccion).toBe(
      'NO_SELECCIONADO',
    );
  });
  it('aplica la selección inicial a varios cursos en una sola operación', async () => {
    await cerrar().expect(200);
    await coord
      .post(`/api/coord/seguimiento/lote?procesoId=${esc.procesoId}`)
      .send({ etapa: 'seleccion', estado: 'SELECCIONADO_PARA_REVISION', codigos: ['INF310', 'INF356'] })
      .expect(201);
    const filas = await db.seguimientoCurso.findMany({ where: { procesoId: esc.procesoId } });
    expect(filas).toHaveLength(2);
    expect(
      filas.every(
        (f) => f.seleccion === 'SELECCIONADO_PARA_REVISION' && f.consejo === 'PENDIENTE' && f.dictado === 'PENDIENTE',
      ),
    ).toBe(true);
  });

  it('no aplica parcialmente una revisión si algún curso no pasó la selección inicial', async () => {
    await cerrar().expect(200);
    const ruta = `/api/coord/seguimiento/lote?procesoId=${esc.procesoId}`;
    await coord
      .post(ruta)
      .send({ etapa: 'seleccion', estado: 'SELECCIONADO_PARA_REVISION', codigos: ['INF310'] })
      .expect(201);
    await coord
      .post(ruta)
      .send({ etapa: 'consejo', estado: 'APROBADO', codigos: ['INF310', 'INF356'] })
      .expect(400);
    expect((await db.seguimientoCurso.findFirstOrThrow()).consejo).toBe('PENDIENTE');
    expect(await db.seguimientoCurso.count()).toBe(1);
    await coord
      .post(ruta)
      .send({ etapa: 'seleccion', estado: 'SELECCIONADO_PARA_REVISION', codigos: ['INF356'] })
      .expect(201);
    await coord
      .post(ruta)
      .send({ etapa: 'consejo', estado: 'APROBADO', codigos: ['INF310', 'INF356'] })
      .expect(201);
    expect(await db.seguimientoCurso.count({ where: { consejo: 'APROBADO' } })).toBe(2);
  });

  it('solo decide el dictado de cursos aprobados y reinicia etapas posteriores al volver atrás', async () => {
    await cerrar().expect(200);
    const ruta = `/api/coord/seguimiento/lote?procesoId=${esc.procesoId}`;
    await coord
      .post(ruta)
      .send({ etapa: 'seleccion', estado: 'SELECCIONADO_PARA_REVISION', codigos: ['INF310', 'INF356'] })
      .expect(201);
    await coord
      .post(ruta)
      .send({ etapa: 'consejo', estado: 'APROBADO', codigos: ['INF310'] })
      .expect(201);
    await coord
      .post(ruta)
      .send({ etapa: 'dictado', estado: 'CONFIRMADO', codigos: ['INF310', 'INF356'] })
      .expect(400);
    expect(await db.seguimientoCurso.count({ where: { dictado: 'CONFIRMADO' } })).toBe(0);
    await coord
      .post(ruta)
      .send({ etapa: 'dictado', estado: 'CONFIRMADO', codigos: ['INF310'] })
      .expect(201);
    await coord
      .post(ruta)
      .send({ etapa: 'seleccion', estado: 'NO_SELECCIONADO', codigos: ['INF310'] })
      .expect(201);
    expect(await db.seguimientoCurso.findFirstOrThrow({ where: { cursoCodigo: 'INF310' } })).toMatchObject({
      seleccion: 'NO_SELECCIONADO',
      consejo: 'PENDIENTE',
      dictado: 'PENDIENTE',
    });
    await coord
      .post(ruta)
      .send({ etapa: 'dictado', estado: 'NO_SE_DICTARA', codigos: ['INF310'] })
      .expect(400);
  });

  it('valida etapa, códigos, cierre y permisos antes de permitir decisiones por lote', async () => {
    const ruta = `/api/coord/seguimiento/lote?procesoId=${esc.procesoId}`;
    const cuerpo = { etapa: 'seleccion', estado: 'SELECCIONADO_PARA_REVISION', codigos: ['INF310'] };
    await coord.post(ruta).send(cuerpo).expect(400);
    await cerrar().expect(200);
    await coord
      .post(ruta)
      .send({ ...cuerpo, estado: 'APROBADO' })
      .expect(400);
    await coord
      .post(ruta)
      .send({ ...cuerpo, codigos: ['INF310', 'INF310'] })
      .expect(400);
    await coord
      .post(ruta)
      .send({ ...cuerpo, codigos: [] })
      .expect(400);
    await coord
      .post(ruta)
      .send({ ...cuerpo, observacion: 'No admitida' })
      .expect(400);
    await coord.post('/api/coord/seguimiento/lote').send(cuerpo).expect(400);
    await coord
      .post(ruta)
      .send({ ...cuerpo, codigos: ['INF310', 'ZZZ999'] })
      .expect(400);
    expect(await db.seguimientoCurso.count()).toBe(0);
    const alumno = await sesion(app, '20000001');
    await alumno.post(ruta).send(cuerpo).expect(403);
  });
  it('permite elegir votaciones propias, aísla los votos y publica el seguimiento del periodo elegido', async () => {
    const alumno = await sesion(app, '20000001');
    await aceptarTerminos(db, esc.procesoId, esc.alumnos['20000001']);
    await alumno
      .post(`/api/alumno/votos?procesoId=${esc.procesoId}`)
      .send(voto('INF310', ['NOCHE']))
      .expect(201);
    await cerrar().expect(200);
    const otro = await db.procesoVotacion.create({
      data: {
        nombre: 'Otro periodo',
        cicloObjetivo: '2028-1',
        estado: 'ABIERTO',
        fechaInicio: new Date(Date.now() - 10000),
        fechaFin: new Date(Date.now() + 86400000),
      },
    });
    await db.padronAlumno.create({ data: { procesoId: otro.id, usuarioId: esc.alumnos['20000001'] } });
    const borrador = await db.procesoVotacion.create({
      data: {
        nombre: 'En preparación',
        cicloObjetivo: '2028-2',
        fechaInicio: new Date(),
        fechaFin: new Date(Date.now() + 86400000),
      },
    });
    await db.padronAlumno.create({ data: { procesoId: borrador.id, usuarioId: esc.alumnos['20000001'] } });
    const lista = await alumno.get('/api/alumno/procesos').expect(200);
    expect(lista.body.map((p: { id: string }) => p.id).sort()).toEqual([esc.procesoId, otro.id].sort());
    expect((await alumno.get(`/api/alumno/estado?procesoId=${esc.procesoId}`).expect(200)).body.votosUsados).toBe(1);
    expect((await alumno.get(`/api/alumno/votos?procesoId=${otro.id}`).expect(200)).body).toEqual([]);
    await alumno
      .post(`/api/alumno/votos?procesoId=${esc.procesoId}`)
      .send(voto('INF356', ['NOCHE']))
      .expect(400);
    await coord
      .patch(`/api/coord/seguimiento/INF310?procesoId=${esc.procesoId}`)
      .send({
        seleccion: 'SELECCIONADO_PARA_REVISION',
        consejo: 'APROBADO',
        dictado: 'CONFIRMADO',
        observacion: 'Privado',
      })
      .expect(200);
    const seguimiento = await alumno.get(`/api/alumno/seguimiento?procesoId=${esc.procesoId}`).expect(200);
    expect(seguimiento.body.cursos.find((c: { codigo: string }) => c.codigo === 'INF310')).toMatchObject({
      seleccion: 'SELECCIONADO_PARA_REVISION',
      consejo: 'APROBADO',
      dictado: 'CONFIRMADO',
    });
    expect(JSON.stringify(seguimiento.body)).not.toContain('Privado');
    expect((await alumno.get(`/api/resultados/publicos?procesoId=${esc.procesoId}`).expect(200)).body.totalVotos).toBe(
      1,
    );
    await db.padronAlumno.delete({
      where: { procesoId_usuarioId: { procesoId: otro.id, usuarioId: esc.alumnos['20000001'] } },
    });
    for (const ruta of ['estado', 'electivos', 'votos', 'seguimiento'])
      await alumno.get(`/api/alumno/${ruta}?procesoId=${otro.id}`).expect(403);
    await alumno.get(`/api/resultados/publicos?procesoId=${otro.id}`).expect(403);
    await alumno.get(`/api/alumno/estado?procesoId=${borrador.id}`).expect(403);
  });

  it('registra varios votos con franjas propias sin duplicar dependencias seleccionadas', async () => {
    await db.requisito.create({
      data: { cursoCodigo: 'INF310', texto: '[INF356]', tipo: 'APROBADO_O_SIMULTANEO', cursoRequerido: 'INF356' },
    });
    await aceptarTerminos(db, esc.procesoId, esc.alumnos['20000003']);
    const alumno = await sesion(app, '20000003');
    const ruta = `/api/alumno/votos/lote?procesoId=${esc.procesoId}`;
    const respuesta = await alumno
      .post(ruta)
      .send({ votos: [voto('INF310', ['NOCHE']), voto('INF356', ['TARDE'])] })
      .expect(201);
    expect(respuesta.body).toHaveLength(2);
    expect(respuesta.body.find((v: { cursoCodigo: string }) => v.cursoCodigo === 'INF356').franjas).toEqual(['TARDE']);
    await alumno
      .post(ruta)
      .send({ votos: [voto('INF310', ['NOCHE'])] })
      .expect(409);
    expect(await db.voto.count()).toBe(2);
    await cerrar().expect(200);
    await alumno
      .post(ruta)
      .send({ votos: [voto('INF310', ['NOCHE'])] })
      .expect(400);
  });

  it('rechaza un lote completo si excede el límite o un curso es inválido', async () => {
    await aceptarTerminos(db, esc.procesoId, esc.alumnos['20000003']);
    const alumno = await sesion(app, '20000003');
    const ruta = `/api/alumno/votos/lote?procesoId=${esc.procesoId}`;
    await db.procesoVotacion.update({ where: { id: esc.procesoId }, data: { maxCursos: 1 } });
    await alumno
      .post(ruta)
      .send({ votos: [voto('INF310', ['NOCHE']), voto('INF356', ['TARDE'])] })
      .expect(400);
    expect(await db.voto.count()).toBe(0);
    await db.procesoVotacion.update({ where: { id: esc.procesoId }, data: { maxCursos: 5 } });
    await alumno
      .post(ruta)
      .send({ votos: [voto('INF310', ['NOCHE']), voto('ZZZ999', ['TARDE'])] })
      .expect(404);
    expect(await db.voto.count()).toBe(0);
    await alumno
      .post(ruta)
      .send({ votos: [voto('INF310', ['NOCHE']), voto('INF310', ['TARDE'])] })
      .expect(400);
    await alumno
      .post(ruta)
      .send({ votos: [voto('INF310', [])] })
      .expect(400);
    await alumno.post(ruta).send({ votos: [] }).expect(400);
    await db.padronAlumno.delete({
      where: { procesoId_usuarioId: { procesoId: esc.procesoId, usuarioId: esc.alumnos['20000003'] } },
    });
    await alumno
      .post(ruta)
      .send({ votos: [voto('INF310', ['NOCHE'])] })
      .expect(403);
  });
});
