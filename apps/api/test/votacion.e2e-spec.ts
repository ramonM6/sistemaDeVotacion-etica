import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AddressInfo } from 'net';
import { io } from 'socket.io-client';
import request from 'supertest';
import { EVENTO_RESULTADOS } from '../src/modules/resultados/resultados.gateway';
import { Escenario, PASSWORD, crearApp, escenarioBase, sesion, voto } from './utils';

describe('Votación (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let esc: Escenario;

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
  });

  describe('autenticación', () => {
    it('un alumno que no está en el Excel de cuentas (padrón) no puede iniciar sesión', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ codigo: '20000009', password: PASSWORD });
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Código o contraseña incorrectos');
    });

    it('un padrón de borrador no habilita el login de un estudiante', async () => {
      await prisma.procesoVotacion.update({ where: { id: esc.procesoId }, data: { estado: 'BORRADOR' } });
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ codigo: '20000001', password: PASSWORD })
        .expect(401);
      await sesion(app, process.env.COORD_USER!, process.env.COORD_PASSWORD!);
    });

    it('permite entrar por una votación cerrada aunque la activa pertenezca a otros alumnos', async () => {
      await prisma.procesoVotacion.update({ where: { id: esc.procesoId }, data: { estado: 'CERRADO' } });
      const ajena = await prisma.procesoVotacion.create({
        data: {
          nombre: 'Votación ajena',
          cicloObjetivo: '2028-1',
          estado: 'ABIERTO',
          fechaInicio: new Date(),
          fechaFin: new Date(Date.now() + 86400000),
        },
      });
      const alumno = await sesion(app, '20000001');
      const lista = await alumno.get('/api/alumno/procesos').expect(200);
      expect(lista.body.map((p: { id: string }) => p.id)).toEqual([esc.procesoId]);
      expect((await alumno.get('/api/procesos/activo').expect(200)).body.id).toBe(esc.procesoId);
      await alumno.get(`/api/alumno/estado?procesoId=${ajena.id}`).expect(403);
      await alumno.get(`/api/alumno/seguimiento?procesoId=${ajena.id}`).expect(403);
      await alumno.get(`/api/resultados/publicos?procesoId=${ajena.id}`).expect(403);
    });

    it('un código inexistente y una contraseña errónea dan el mismo mensaje genérico', async () => {
      const a = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ codigo: '12345678', password: 'xxxxxxxx' });
      const b = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ codigo: '20000001', password: 'incorrecta' });
      expect(a.status).toBe(401);
      expect(b.status).toBe(401);
      expect(a.body.message).toBe(b.body.message);
    });

    it('la sesión va en una cookie httpOnly SameSite=Strict de 8 horas', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ codigo: '20000001', password: PASSWORD });
      expect(res.status).toBe(200);
      const cookie = ([] as string[]).concat(res.headers['set-cookie'] as unknown as string[])[0];
      expect(cookie).toMatch(/^sesion=/);
      expect(cookie).toMatch(/HttpOnly/i);
      expect(cookie).toMatch(/SameSite=Strict/i);
      expect(cookie).toMatch(/Max-Age=28800/);
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('sin sesión no se accede a la API y un alumno no accede a endpoints de coordinación', async () => {
      expect((await request(app.getHttpServer()).get('/api/alumno/estado')).status).toBe(401);
      const alumno = await sesion(app, '20000001');
      expect((await alumno.get('/api/coord/resultados')).status).toBe(403);
      expect((await alumno.get('/api/coord/padron')).status).toBe(403);
      const coord = await sesion(app, process.env.COORD_USER!, process.env.COORD_PASSWORD!);
      expect((await coord.get('/api/alumno/estado')).status).toBe(403);
    });
  });

  describe('electivos y elegibilidad', () => {
    it('el alumno ve TODOS los electivos, con su aptitud y el motivo si no es apto', async () => {
      const alumno = await sesion(app, '20000003');
      const res = await alumno.get('/api/alumno/electivos');
      expect(res.status).toBe(200);
      expect(res.body.electivos).toHaveLength(7);
      const porCodigo = Object.fromEntries(res.body.electivos.map((e: any) => [e.codigo, e]));
      expect(porCodigo['INF310'].elegibilidad.aptitud).toBe('CONFIRMADO');
      expect(porCodigo['1INF02'].elegibilidad.aptitud).toBe('NO_APTO');
      expect(porCodigo['1INF02'].elegibilidad.requisitos[0]).toMatchObject({
        cumple: false,
        detalle: 'No registra 1INF24',
      });
    });

    it('marca CONDICIONAL y lista el curso en curso', async () => {
      const alumno = await sesion(app, '20000002');
      const res = await alumno.get('/api/alumno/electivos/1INF02');
      expect(res.body.elegibilidad).toMatchObject({ aptitud: 'CONDICIONAL', cursosEnCursoNecesarios: ['1INF24'] });
    });
  });

  describe('reglas de votación (aunque la petición vaya directo a la API)', () => {
    it('permite votar sin aceptación de términos y no expone esa información', async () => {
      const alumno = await sesion(app, '20000001');
      const estado = await alumno.get('/api/alumno/estado').expect(200);
      expect(estado.body).not.toHaveProperty('terminos');
      expect(estado.body.puedeVotar).toBe(true);
      await alumno
        .post('/api/alumno/votos')
        .send(voto('INF310', ['NOCHE']))
        .expect(201);
    });

    it.each([
      ['sin franjas', { cursoCodigo: 'INF310', franjas: [] }],
      ['sin el campo franjas', { cursoCodigo: 'INF310' }],
      ['con más de 2 franjas', { cursoCodigo: 'INF310', franjas: ['MANANA', 'TARDE', 'NOCHE'] }],
      ['con franjas repetidas', { cursoCodigo: 'INF310', franjas: ['NOCHE', 'NOCHE'] }],
      ['con una franja inexistente', { cursoCodigo: 'INF310', franjas: ['MADRUGADA'] }],
      ['con campos no permitidos', { cursoCodigo: 'INF310', franjas: ['NOCHE'], aptitud: 'CONFIRMADO' }],
    ])('rechaza un voto %s', async (_, cuerpo) => {
      const alumno = await sesion(app, '20000001');
      const res = await alumno.post('/api/alumno/votos').send(cuerpo);
      expect(res.status).toBe(400);
      expect(await prisma.voto.count()).toBe(0);
    });

    it('acepta 1 o 2 franjas y guarda la aptitud como snapshot', async () => {
      const alumno = await sesion(app, '20000002');
      const a = await alumno.post('/api/alumno/votos').send(voto('1INF02', ['TARDE', 'MANANA']));
      expect(a.status).toBe(201);
      expect(a.body).toMatchObject({ cursoCodigo: '1INF02', aptitud: 'CONDICIONAL', franjas: ['MANANA', 'TARDE'] });
      const b = await alumno.post('/api/alumno/votos').send(voto('INF310', ['NOCHE']));
      expect(b.status).toBe(201);
      expect(b.body.aptitud).toBe('CONFIRMADO');
    });

    it('no permite votar por un electivo NO_APTO ni por un curso que no es electivo', async () => {
      const alumno = await sesion(app, '20000003');
      expect((await alumno.post('/api/alumno/votos').send(voto('1INF02', ['NOCHE']))).status).toBe(403);
      expect((await alumno.post('/api/alumno/votos').send(voto('1INF24', ['NOCHE']))).status).toBe(404);
      expect(await prisma.voto.count()).toBe(0);
    });

    it('no permite votar dos veces por el mismo curso', async () => {
      const alumno = await sesion(app, '20000001');
      expect((await alumno.post('/api/alumno/votos').send(voto('INF310', ['NOCHE']))).status).toBe(201);
      const res = await alumno.post('/api/alumno/votos').send(voto('INF310', ['TARDE']));
      expect(res.status).toBe(409);
      expect(await prisma.voto.count()).toBe(1);
    });

    it('no permite votar por más de 5 cursos', async () => {
      const alumno = await sesion(app, '20000001');
      for (const c of ['1INF02', '1INF64', 'DER349', 'INF310', 'INF356']) {
        expect((await alumno.post('/api/alumno/votos').send(voto(c, ['NOCHE']))).status).toBe(201);
      }
      const res = await alumno.post('/api/alumno/votos').send(voto('INF372', ['NOCHE']));
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/5 votos/);
      expect((await alumno.get('/api/alumno/estado')).body).toMatchObject({ votosUsados: 5, puedeVotar: false });
    });

    it('respeta maxCursos y maxFranjas configurados en el proceso', async () => {
      await prisma.procesoVotacion.update({ where: { id: esc.procesoId }, data: { maxCursos: 2, maxFranjas: 1 } });

      const alumno = await sesion(app, '20000001');
      expect((await alumno.post('/api/alumno/votos').send(voto('INF310', ['NOCHE', 'TARDE']))).status).toBe(400);
      expect((await alumno.post('/api/alumno/votos').send(voto('INF310', ['NOCHE']))).status).toBe(201);
      expect((await alumno.post('/api/alumno/votos').send(voto('INF356', ['NOCHE']))).status).toBe(201);
      expect((await alumno.post('/api/alumno/votos').send(voto('INF372', ['NOCHE']))).status).toBe(400);
    });

    it('con peticiones simultáneas nunca supera el máximo de 5 votos', async () => {
      const alumno = await sesion(app, '20000001');
      const cursos = ['1INF02', '1INF64', 'DER349', 'INF310', 'INF356', 'INF372', 'INF373'];
      const respuestas = await Promise.all(
        cursos.map((c) => alumno.post('/api/alumno/votos').send(voto(c, ['NOCHE']))),
      );
      expect(respuestas.filter((r) => r.status === 201)).toHaveLength(5);
      expect(await prisma.voto.count({ where: { usuarioId: esc.alumnos['20000001'] } })).toBe(5);
    });

    it('con peticiones simultáneas por el mismo curso solo se registra un voto', async () => {
      const alumno = await sesion(app, '20000004');
      const respuestas = await Promise.all(
        [1, 2, 3, 4].map(() => alumno.post('/api/alumno/votos').send(voto('INF310', ['NOCHE']))),
      );
      expect(respuestas.filter((r) => r.status === 201)).toHaveLength(1);
      expect(respuestas.filter((r) => r.status === 409)).toHaveLength(3);
    });

    it('permite editar y retirar solo las elecciones propias mientras esté abierto', async () => {
      const alumno = await sesion(app, '20000001');
      await alumno
        .post('/api/alumno/votos')
        .send(voto('INF310', ['NOCHE']))
        .expect(201);
      await alumno
        .patch('/api/alumno/votos/INF310')
        .send(voto('INF310', ['TARDE']))
        .expect(200);
      expect((await alumno.get('/api/alumno/votos')).body[0].franjas).toEqual(['TARDE']);
      const otro = await sesion(app, '20000002');
      await otro.delete('/api/alumno/votos/INF310').expect(404);
      await prisma.procesoVotacion.update({ where: { id: esc.procesoId }, data: { estado: 'CERRADO' } });
      await alumno.delete('/api/alumno/votos/INF310').expect(400);
      await alumno
        .patch('/api/alumno/votos/INF310')
        .send(voto('INF310', ['MANANA']))
        .expect(400);
      await prisma.procesoVotacion.update({ where: { id: esc.procesoId }, data: { estado: 'ABIERTO' } });
      await alumno.delete('/api/alumno/votos/INF310').expect(200);
      expect(await prisma.voto.count()).toBe(0);
    });

    it('no se puede votar si el proceso está cerrado o si pasó la fecha de fin', async () => {
      const alumno = await sesion(app, '20000001');
      await prisma.procesoVotacion.update({ where: { id: esc.procesoId }, data: { estado: 'CERRADO' } });
      expect((await alumno.post('/api/alumno/votos').send(voto('INF310', ['NOCHE']))).status).toBe(400);

      await prisma.procesoVotacion.update({
        where: { id: esc.procesoId },
        data: { estado: 'ABIERTO', fechaFin: new Date(Date.now() - 1000) },
      });
      expect((await alumno.post('/api/alumno/votos').send(voto('INF310', ['NOCHE']))).status).toBe(400);
      // el cierre automático deja el proceso en CERRADO
      expect((await alumno.get('/api/procesos/activo')).body.estado).toBe('CERRADO');
    });
  });

  describe('resultados', () => {
    async function votar(codigo: string, votos: [string, string[]][]) {
      const alumno = await sesion(app, codigo);
      for (const [c, f] of votos) expect((await alumno.post('/api/alumno/votos').send(voto(c, f))).status).toBe(201);
      return alumno;
    }

    it('los resultados públicos no incluyen datos de los votantes', async () => {
      const alumno = await votar('20000001', [['INF310', ['NOCHE', 'TARDE']]]);
      expect((await alumno.get('/api/resultados/publicos')).body.ranking).toEqual([]);
      await prisma.procesoVotacion.update({ where: { id: esc.procesoId }, data: { estado: 'CERRADO' } });
      const res = await alumno.get('/api/resultados/publicos');
      expect(res.status).toBe(200);
      expect(res.body.ranking).toEqual([
        expect.objectContaining({
          codigo: 'INF310',
          total: 1,
          franjas: { MANANA: 0, MEDIA_MANANA: 0, MEDIODIA: 0, TARDE: 1, NOCHE: 1 },
        }),
      ]);
      const texto = JSON.stringify(res.body);
      expect(texto).not.toContain('20000001');
      expect(texto).not.toContain('Nombre');
    });

    it('el coordinador ve indicadores, ranking confirmados/condicionales sin identidades de votantes', async () => {
      await votar('20000001', [
        ['1INF02', ['NOCHE']],
        ['INF310', ['NOCHE', 'MANANA']],
      ]);
      await votar('20000002', [['1INF02', ['TARDE', 'NOCHE']]]);
      const coord = await sesion(app, process.env.COORD_USER!, process.env.COORD_PASSWORD!);

      const res = await coord.get('/api/coord/resultados');
      expect(res.body.indicadores).toEqual({ habilitados: 4, votaron: 2, participacion: 50, totalVotos: 3 });
      expect(res.body.ranking[0]).toMatchObject({
        codigo: '1INF02',
        total: 2,
        confirmados: 1,
        condicionales: 1,
        franjas: { MANANA: 0, MEDIA_MANANA: 0, MEDIODIA: 0, TARDE: 1, NOCHE: 2 },
      });

      const soloConfirmados = await coord.get('/api/coord/resultados?aptitud=CONFIRMADO');
      expect(soloConfirmados.body.ranking.find((f: any) => f.codigo === '1INF02').total).toBe(1);

      const detalle = await coord.get('/api/coord/resultados/1INF02');
      expect(detalle.body.votantes).toEqual([]);
    });

    it('emite resultados:actualizados por Socket.IO al registrar un voto', async () => {
      await app.listen(0);
      const { port } = app.getHttpServer().address() as AddressInfo;
      const socket = io(`http://localhost:${port}/resultados`, { transports: ['websocket'] });
      await new Promise<void>((ok, error) => {
        socket.on('connect', () => ok());
        socket.on('connect_error', error);
      });
      const evento = new Promise<any>((ok) => socket.once(EVENTO_RESULTADOS, ok));

      await votar('20000001', [['INF310', ['NOCHE']]]);
      const datos = await evento;
      socket.close();
      expect(datos).toMatchObject({ motivo: 'voto', procesoId: esc.procesoId });
      expect(JSON.stringify(datos)).not.toContain('20000001');
    });
  });
});
