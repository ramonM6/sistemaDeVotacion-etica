import { StorageService } from '../src/modules/importacion/storage.service';
describe('Supabase Storage privado', () => {
  let fetchMock: jest.SpyInstance;
  const previos = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    bucket: process.env.SUPABASE_STORAGE_BUCKET,
  };
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://ejemplo.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave-solo-servidor';
    process.env.SUPABASE_STORAGE_BUCKET = 'privado';
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => {
    fetchMock.mockRestore();
    for (const [nombre, valor] of Object.entries({
      SUPABASE_URL: previos.url,
      SUPABASE_SERVICE_ROLE_KEY: previos.key,
      SUPABASE_STORAGE_BUCKET: previos.bucket,
    })) {
      if (valor === undefined) delete process.env[nombre];
      else process.env[nombre] = valor;
    }
  });
  it('sube bytes, descarga autenticada y limpia por ruta sin guardar el contenido en metadatos', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ public: false })))
      .mockResolvedValueOnce(new Response('{}'));
    const storage = new StorageService();
    const bytes = Buffer.from('codigo,nombre\nINF310,Grafos');
    const original = await storage.subir('malla.csv', bytes, 'proceso/malla');
    expect(original).toMatchObject({ bucket: 'privado', sha256: expect.any(String) });
    expect(original).not.toHaveProperty('contenido');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'text/csv', 'x-upsert': 'false' },
    });
    expect(Buffer.from(fetchMock.mock.calls[1][1].body)).toEqual(bytes);
    fetchMock.mockResolvedValueOnce(new Response(bytes));
    expect(await storage.descargar(original.bucket, original.ruta)).toEqual(bytes);
    expect(fetchMock.mock.calls[2][0]).toContain('/object/authenticated/privado/');
    fetchMock.mockResolvedValueOnce(new Response('{}'));
    await storage.eliminar(original.bucket, original.ruta);
    expect(JSON.parse(fetchMock.mock.calls[3][1].body).prefixes).toEqual([original.ruta]);
  });
  it('publica recursos en una ruta estable y permite actualizar solo esa copia', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ public: false })))
      .mockResolvedValueOnce(new Response('{}'));
    const original = await new StorageService().publicarRecurso('plantillas', 'malla', Buffer.from('xlsx'));
    expect(original.ruta).toBe('sistema-votacion/recursos/v1/plantillas/plantilla_malla_curricular.xlsx');
    expect(fetchMock.mock.calls[1][1].headers['x-upsert']).toBe('true');
    expect(fetchMock.mock.calls[1][0]).toContain(original.ruta);
  });

  it('rechaza buckets públicos antes de subir información', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ public: true })));
    await expect(new StorageService().subir('alumnos.xlsx', Buffer.from('datos'), 'cuentas')).rejects.toThrow(
      'debe ser privado',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('no devuelve claves ni respuestas internas ante errores de Storage', async () => {
    fetchMock.mockResolvedValue(new Response('clave-solo-servidor', { status: 403 }));
    await expect(new StorageService().subir('malla.csv', Buffer.from('datos'), 'malla')).rejects.toThrow(
      'No se pudo acceder',
    );
  });
});
