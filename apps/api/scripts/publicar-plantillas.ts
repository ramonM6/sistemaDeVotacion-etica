/** Publicación manual: las descargas de la API leen exclusivamente Supabase Storage. */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { StorageService } from '../src/modules/importacion/storage.service';
import { RECURSOS, type ClaseRecurso } from '../src/modules/importacion/recursos';

async function main() {
  const storage = new StorageService();
  // Los originales de distribución se usan solo para publicar o para pruebas, nunca al descargar.
  const fuentes = (Object.keys(RECURSOS) as ClaseRecurso[]).flatMap((clase) =>
    Object.entries(RECURSOS[clase]).map(([tipo, nombre]) => ({
      clase,
      tipo,
      nombre,
      contenido: readFileSync(
        resolve(__dirname, '../../../docs', clase === 'plantillas' ? 'plantillas' : 'datos-prueba', nombre),
      ),
    })),
  );
  for (const f of fuentes) {
    const original = await storage.publicarRecurso(f.clase, f.tipo, f.contenido);
    const remoto = await storage.descargar(original.bucket, original.ruta);
    if (createHash('sha256').update(remoto).digest('hex') !== original.sha256)
      throw Error('No coincide el archivo publicado');
    console.log(`Publicado y verificado: ${f.clase}/${f.nombre}`);
  }
}
main().catch(() => {
  console.error(
    'No se pudieron publicar los recursos. Revisa las fuentes y la configuración del bucket privado de Supabase.',
  );
  process.exitCode = 1;
});
