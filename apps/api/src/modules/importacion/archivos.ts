import { createDecipheriv, createHash } from 'crypto';
import { config } from '../../config';

function clave() {
  return createHash('sha256')
    .update(process.env.ARCHIVOS_SECRET ?? config.jwtSecret)
    .digest();
}

/** Compatibilidad para migrar originales cifrados de versiones anteriores a Storage. */
export function descifrarArchivo(contenido: Buffer) {
  const descifrador = createDecipheriv('aes-256-gcm', clave(), contenido.subarray(0, 12));
  descifrador.setAuthTag(contenido.subarray(12, 28));
  return Buffer.concat([descifrador.update(contenido.subarray(28)), descifrador.final()]);
}
