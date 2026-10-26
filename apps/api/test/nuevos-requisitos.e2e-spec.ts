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

  it('filtra agregados por ingreso, CRAEst y matrícula sin exponer identidades', async () => {
    await db.padronAlumno.update({
      where: { procesoId_usuarioId: { procesoId: esc.procesoId, usuarioId: esc.alumnos['20000001'] } },
      data: { ingreso: '2020', craest: 65, matriculado: false },
    });
    await aceptarTerminos(db, esc.procesoId, esc.alumnos['20000001']);
    const alumno = await sesion(app, '20000001');
    await alumno
      .post('/api/alumno/votos')
      .send(voto('INF310', ['TARDE']))
      .expect(201);
    const res = await coord
      .get('/api/coord/resultados?ingreso=2020&craestMin=60&craestMax=70&matriculado=no')
      .expect(200);
    expect(res.body.indicadores).toMatchObject({ habilitados: 1, votaron: 1, totalVotos: 1 });
    expect(res.body.agrupaciones).toContainEqual(
      expect.objectContaining({ codigo: 'INF310', grupo: 'ingreso: 2020', alumnos: 1, votos: 1, poblacion: 1 }),
    );
    expect(JSON.stringify(res.body)).not.toContain('20000001');
    expect((await coord.get('/api/coord/resultados?matriculado=si')).body.ranking).toEqual([]);
  });

  it('genera PDF descargable y exige rol coordinador', async () => {
    const res = await coord
      .get('/api/coord/export/resultados.pdf?tabla=si&graficos=no')
      .buffer(true)
      .parse((r, cb) => {
        const partes: Buffer[] = [];
        r.on('data', (d) => partes.push(d));
        r.on('end', () => cb(null, Buffer.concat(partes)));
      })
      .expect(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.body.subarray(0, 4).toString()).toBe('%PDF');
    const alumno = await sesion(app, '20000001');
    await alumno.get('/api/coord/export/resultados.pdf').expect(403);
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
});
