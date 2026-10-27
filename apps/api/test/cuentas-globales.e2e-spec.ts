import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { crearApp, escenarioBase, Escenario, sesion, voto } from './utils';

describe('Cuentas globales y acceso por historial', () => {
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
  async function importar(tipo: string, csv: string, procesoId?: string) {
    const url = `/api/coord/import/${tipo}/preview${procesoId ? `?procesoId=${procesoId}` : ''}`;
    const p = await coord.post(url).attach('archivo', Buffer.from(csv), `${tipo}.csv`).expect(200);
    expect(p.body.resumen.conErrores).toBe(0);
    await coord.post(`/api/coord/import/${tipo}/confirmar`).send({ token: p.body.token }).expect(200);
  }
  it('crea cuentas sin votaciones y habilita solo a quienes tienen historial cuando se publica', async () => {
    await db.procesoVotacion.deleteMany();
    await importar(
      'cuentas',
      'codigo,nombres,apellidos,password\n20990001,Ana,Prueba,Alumno#2026\n20990002,Bruno,Prueba,Alumno#2026',
    );
    const ana = await sesion(app, '20990001', 'Alumno#2026');
    const bruno = await sesion(app, '20990002', 'Alumno#2026');
    expect((await ana.get('/api/alumno/procesos').expect(200)).body).toEqual([]);
    await ana.get('/api/auth/me').expect(200);
    const original = await db.archivoCarga.findFirstOrThrow({ where: { tipo: 'cuentas' } });
    expect(original.procesoId).toBeNull();
    const p = await coord
      .post('/api/coord/procesos')
      .send({
        nombre: 'Votación con historial',
        cicloObjetivo: '2027-1',
        fechaInicio: new Date(Date.now() - 10000).toISOString(),
        fechaFin: new Date(Date.now() + 86400000).toISOString(),
      })
      .expect(201);
    const id = p.body.id;
    await importar(
      'malla',
      'codigo,nombre,creditos,tipo\nINF101,Curso base,4,OBLIGATORIO\nINF201,Curso electivo,3,ELECTIVO',
      id,
    );
    await importar('historial', 'codigo_alumno,codigo_curso,nota\n20990001,INF101,15', id);
    expect((await ana.get('/api/alumno/procesos')).body).toEqual([]);
    await ana.get(`/api/alumno/estado?procesoId=${id}`).expect(403);
    const padron = await coord.get(`/api/coord/padron?procesoId=${id}`).expect(200);
    expect(padron.body.alumnos.map((a: { codigo: string }) => a.codigo)).toEqual(['20990001']);
    await coord.patch(`/api/coord/procesos/${id}/estado`).send({ estado: 'ABIERTO' }).expect(200);
    expect((await ana.get('/api/alumno/procesos').expect(200)).body.map((p: { id: string }) => p.id)).toEqual([id]);
    expect((await bruno.get('/api/alumno/procesos').expect(200)).body).toEqual([]);
    await ana
      .post(`/api/alumno/votos?procesoId=${id}`)
      .send(voto('INF201', ['NOCHE']))
      .expect(201);
    for (const ruta of ['estado', 'electivos', 'votos', 'seguimiento'])
      await bruno.get(`/api/alumno/${ruta}?procesoId=${id}`).expect(403);
    await bruno.get(`/api/resultados/publicos?procesoId=${id}`).expect(403);
    await bruno
      .post(`/api/alumno/votos?procesoId=${id}`)
      .send(voto('INF201', ['NOCHE']))
      .expect(403);
    // Las cuentas omitidas se deshabilitan sin borrar sus datos de votación.
    await importar('cuentas', 'codigo,nombres,apellidos,password\n20990003,Carla,Prueba,Alumno#2026');
    await ana.get('/api/auth/me').expect(401);
    await ana.get(`/api/alumno/votos?procesoId=${id}`).expect(401);
    expect(await db.voto.count({ where: { procesoId: id } })).toBe(1);
    expect(await db.historialItem.count({ where: { procesoId: id } })).toBe(1);
    expect((await coord.get('/api/coord/import/alumnos')).body.map((a: { codigo: string }) => a.codigo)).toEqual([
      '20990003',
    ]);
    expect(await db.padronAlumno.count({ where: { procesoId: id } })).toBe(1);
  });
  it('el último archivo sustituye la lista activa y permite reactivar sin duplicar cuentas', async () => {
    const usuarioId = esc.alumnos['20000001'];
    const alumno = await sesion(app, '20000001');
    const antes = await db.historialItem.count({ where: { usuarioId } });
    const csv = 'codigo,nombres,apellidos,password\n20000002,Ana,Test,Alumno#Test1';
    const p = await coord
      .post('/api/coord/import/cuentas/preview')
      .attach('archivo', Buffer.from(csv), 'alumnos.csv')
      .expect(200);
    expect(p.body.cuentasADeshabilitar).toBe(4);
    await coord.post('/api/coord/import/cuentas/confirmar').send({ token: p.body.token }).expect(200);
    expect((await coord.get('/api/coord/import/alumnos')).body.map((a: { codigo: string }) => a.codigo)).toEqual([
      '20000002',
    ]);
    await alumno.get('/api/auth/me').expect(401);
    await alumno.post('/api/auth/login').send({ codigo: '20000001', password: 'Alumno#Test1' }).expect(401);
    expect(await db.historialItem.count({ where: { usuarioId } })).toBe(antes);
    await importar('cuentas', csv + '\n20000001,Bruno,Test,Alumno#Test1');
    expect((await db.usuario.findUniqueOrThrow({ where: { codigo: '20000001' } })).id).toBe(usuarioId);
    await sesion(app, '20000001');
    expect(await db.usuario.count({ where: { rol: 'ALUMNO', activo: true } })).toBe(2);
  });

  it('rechaza historial de alumnos sin cuenta y reemplaza el padrón al reemplazar historial', async () => {
    await db.procesoVotacion.update({ where: { id: esc.procesoId }, data: { estado: 'BORRADOR' } });
    const invalido = await coord
      .post(`/api/coord/import/historial/preview?procesoId=${esc.procesoId}`)
      .attach('archivo', Buffer.from('codigo_alumno,codigo_curso,nota\n20998888,1INF24,15'), 'historial.csv')
      .expect(200);
    expect(invalido.body.token).toBeNull();
    expect(invalido.body.filas[0].errores.join(' ')).toContain('cuenta registrada');
    await importar('historial', 'codigo_alumno,codigo_curso,nota\n20000001,1INF24,15', esc.procesoId);
    expect(await db.padronAlumno.count({ where: { procesoId: esc.procesoId } })).toBe(1);
    await importar('historial', 'codigo_alumno,codigo_curso,nota\n20000002,1INF24,', esc.procesoId);
    const p = await db.padronAlumno.findMany({ where: { procesoId: esc.procesoId }, include: { usuario: true } });
    expect(p.map((p) => p.usuario.codigo)).toEqual(['20000002']);
    await coord.delete(`/api/coord/import/historial?procesoId=${esc.procesoId}`).expect(200);
    expect(await db.padronAlumno.count({ where: { procesoId: esc.procesoId } })).toBe(0);
    await sesion(app, '20000002');
    await coord
      .post(`/api/coord/import/cuentas/preview?procesoId=${esc.procesoId}`)
      .attach(
        'archivo',
        Buffer.from('codigo,nombres,apellidos,password\n20990001,Ana,Prueba,Alumno#2026'),
        'cuentas.csv',
      )
      .expect(400);
  });
});
