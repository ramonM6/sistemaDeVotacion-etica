import { createHash, randomUUID } from 'crypto';
/** Solo pruebas: nunca se usa como alternativa de almacenamiento en ejecución normal. */
export class StorageFalso {
  readonly archivos = new Map<string, Buffer>();
  async subir(_nombre: string, contenido: Buffer, prefijo: string) {
    const ruta = `${prefijo}/${randomUUID()}`;
    this.archivos.set(ruta, Buffer.from(contenido));
    return { bucket: 'pruebas', ruta, sha256: createHash('sha256').update(contenido).digest('hex') };
  }
  async descargar(_bucket: string, ruta: string) {
    const contenido = this.archivos.get(ruta);
    if (!contenido) throw new Error('Original no encontrado');
    return Buffer.from(contenido);
  }
  async eliminar(_bucket: string, ruta: string) {
    this.archivos.delete(ruta);
  }
}
