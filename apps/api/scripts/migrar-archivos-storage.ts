import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { StorageService } from '../src/modules/importacion/storage.service';
import { descifrarArchivo } from '../src/modules/importacion/archivos';
const db = new PrismaClient();
const storage = new StorageService();
async function ejecutar() {
  const archivos = await db.archivoCarga.findMany({ where: { contenido: { not: null } } });
  for (const archivo of archivos) {
    if (archivo.bucket && archivo.ruta) {
      // Verifica la copia remota antes de eliminar el contenido antiguo.
      await storage.descargar(archivo.bucket, archivo.ruta);
      await db.archivoCarga.update({ where: { id: archivo.id }, data: { contenido: null } });
      continue;
    }
    const buffer = descifrarArchivo(Buffer.from(archivo.contenido!));
    const original = await storage.subir(archivo.nombre, buffer, `${archivo.procesoId ?? 'global'}/${archivo.tipo}`);
    try {
      await db.archivoCarga.update({ where: { id: archivo.id }, data: { ...original, contenido: null } });
    } catch (error) {
      await storage.eliminar(original.bucket, original.ruta).catch(() => undefined);
      throw error;
    }
    console.log(`Migrado: ${archivo.id}`);
  }
  console.log(
    `Revisados ${archivos.length} archivos antiguos. Los nuevos originales se guardan exclusivamente en Storage.`,
  );
}
ejecutar()
  .catch(() => {
    console.error(
      'No se completó la migración. Los originales pendientes siguen intactos. Revisa la configuración de Storage y ARCHIVOS_SECRET.',
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
