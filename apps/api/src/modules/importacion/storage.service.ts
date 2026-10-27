import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';

export interface OriginalGuardado {
  bucket: string;
  ruta: string;
  sha256: string;
}

/** El bucket debe ser privado. La clave de servicio nunca se envía al navegador. */
@Injectable()
export class StorageService {
  private configuracion(bucket?: string) {
    const url = process.env.SUPABASE_URL?.replace(/\/$/, '');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key)
      throw new ServiceUnavailableException('Configura Supabase Storage para guardar los archivos originales.');
    return {
      url,
      bucket: bucket ?? (process.env.SUPABASE_STORAGE_BUCKET || 'votainf-importaciones'),
      headers: { Authorization: `Bearer ${key}`, apikey: key },
    };
  }
  private async solicitar(url: string, opciones: RequestInit) {
    try {
      const respuesta = await fetch(url, { ...opciones, signal: AbortSignal.timeout(20_000) });
      if (!respuesta.ok) throw new Error('Storage');
      return respuesta;
    } catch {
      throw new ServiceUnavailableException(
        'No se pudo acceder a Supabase Storage. Comprueba la conexión y el bucket privado.',
      );
    }
  }
  async subir(nombre: string, archivo: Buffer, prefijo: string): Promise<OriginalGuardado> {
    const c = this.configuracion();
    // Comprueba la privacidad antes de enviar archivos que podrían contener cuentas o notas.
    const bucket = await this.solicitar(`${c.url}/storage/v1/bucket/${encodeURIComponent(c.bucket)}`, {
      headers: c.headers,
    });
    const datos = (await bucket.json()) as { public?: boolean };
    if (datos.public !== false)
      throw new ServiceUnavailableException('El bucket de archivos académicos debe ser privado.');
    const extension = nombre.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx';
    const ruta = `sistema-votacion/${prefijo}/${randomUUID()}.${extension}`;
    const tipo = extension === 'csv' ? 'text/csv' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    await this.solicitar(`${c.url}/storage/v1/object/${encodeURIComponent(c.bucket)}/${ruta}`, {
      method: 'POST',
      headers: { ...c.headers, 'Content-Type': tipo, 'x-upsert': 'false' },
      body: new Uint8Array(archivo),
    });
    return { bucket: c.bucket, ruta, sha256: createHash('sha256').update(archivo).digest('hex') };
  }
  async descargar(bucket: string, ruta: string) {
    const c = this.configuracion(bucket);
    const respuesta = await this.solicitar(
      `${c.url}/storage/v1/object/authenticated/${encodeURIComponent(c.bucket)}/${ruta.split('/').map(encodeURIComponent).join('/')}`,
      { headers: c.headers },
    );
    return Buffer.from(await respuesta.arrayBuffer());
  }
  async eliminar(bucket: string, ruta: string) {
    const c = this.configuracion(bucket);
    await this.solicitar(`${c.url}/storage/v1/object/${encodeURIComponent(c.bucket)}`, {
      method: 'DELETE',
      headers: { ...c.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: [ruta] }),
    });
  }
}
