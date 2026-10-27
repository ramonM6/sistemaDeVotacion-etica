import { createHash, randomUUID } from 'crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ServiceUnavailableException } from '@nestjs/common';
import { RECURSOS, recurso, type ClaseRecurso } from '../src/modules/importacion/recursos';
/** Solo pruebas: nunca se usa como alternativa de almacenamiento en ejecución normal. */
export class StorageFalso {
  readonly archivos = new Map<string, Buffer>();
  readonly recursos = new Map<string, Buffer>();
  constructor() {
    for (const clase of Object.keys(RECURSOS) as ClaseRecurso[])
      for (const [tipo, nombre] of Object.entries(RECURSOS[clase]))
        this.recursos.set(
          recurso(clase, tipo).ruta,
          readFileSync(
            resolve(__dirname, '../../../docs', clase === 'plantillas' ? 'plantillas' : 'datos-prueba', nombre),
          ),
        );
  }
  async subir(_nombre: string, contenido: Buffer, prefijo: string) {
    const ruta = `${prefijo}/${randomUUID()}`;
    this.archivos.set(ruta, Buffer.from(contenido));
    return { bucket: 'pruebas', ruta, sha256: createHash('sha256').update(contenido).digest('hex') };
  }
  async descargar(_bucket: string, ruta: string) {
    const contenido = this.recursos.get(ruta) ?? this.archivos.get(ruta);
    if (!contenido) throw new ServiceUnavailableException('Recurso no disponible en Storage');
    return Buffer.from(contenido);
  }
  async eliminar(_bucket: string, ruta: string) {
    this.archivos.delete(ruta);
  }
}
