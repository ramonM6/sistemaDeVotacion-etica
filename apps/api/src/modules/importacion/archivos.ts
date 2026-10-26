import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { config } from '../../config';

function clave() {
  return createHash('sha256')
    .update(process.env.ARCHIVOS_SECRET ?? config.jwtSecret)
    .digest();
}

export function cifrarArchivo(archivo: Buffer) {
  const iv = randomBytes(12);
  const cifrador = createCipheriv('aes-256-gcm', clave(), iv);
  const cifrado = Buffer.concat([cifrador.update(archivo), cifrador.final()]);
  return {
    sha256: createHash('sha256').update(archivo).digest('hex'),
    contenido: Buffer.concat([iv, cifrador.getAuthTag(), cifrado]),
  };
}

export function descifrarArchivo(contenido: Buffer) {
  const descifrador = createDecipheriv('aes-256-gcm', clave(), contenido.subarray(0, 12));
  descifrador.setAuthTag(contenido.subarray(12, 28));
  return Buffer.concat([descifrador.update(contenido.subarray(28)), descifrador.final()]);
}
