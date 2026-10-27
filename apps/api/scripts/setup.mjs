// Se ejecuta antes de `npm run dev`: prepara .env, aplica migraciones y crea el coordinador la primera vez.
import { config as loadEnv } from 'dotenv';
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = resolve(raiz, '.env');
if (!existsSync(env)) {
  copyFileSync(resolve(raiz, '.env.example'), env);
  console.log('› Se creó apps/api/.env a partir de .env.example');
}
// Se carga explícitamente (después de crearlo): el cliente de Prisma solo lee el .env si ya existía
// al ejecutar `prisma generate` en `npm install`, y en un clon nuevo todavía no existe.
// No sobrescribe variables ya definidas en el entorno.
loadEnv({ path: env });
// Compatibilidad con configuraciones locales anteriores sin pooler.
process.env.DIRECT_URL ??= process.env.DATABASE_URL;

const ejecutar = (cmd) => execSync(cmd, { cwd: raiz, stdio: 'inherit' });
// Regenera el cliente también al actualizar el esquema sin reinstalar dependencias.
ejecutar('npx prisma generate');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Reintenta si PostgreSQL tarda unos segundos en aceptar conexiones.
let intentos = 0;
for (;;) {
  try {
    execSync('npx prisma migrate deploy', { cwd: raiz, stdio: 'pipe' });
    console.log('› Migraciones aplicadas');
    break;
  } catch (e) {
    if (++intentos >= 15) {
      console.error(String(e.stderr ?? e.message));
      console.error('✖ No se pudo aplicar las migraciones en PostgreSQL.');
      console.error('  Verifica el acceso a PostgreSQL y las variables DATABASE_URL y DIRECT_URL');
      console.error('  en apps/api/.env: usuario, contraseña, host, puerto y base de datos.');
      process.exit(1);
    }
    if (intentos === 1) console.log('› Esperando a PostgreSQL…');
    await esperar(2000);
  }
}

// Carga el seed solo si la base está vacía (sin coordinador).
const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();
const hayCoordinador = (await prisma.usuario.count({ where: { rol: 'COORDINADOR' } })) > 0;
await prisma.$disconnect();
if (!hayCoordinador) {
  console.log('› Base vacía: creando la cuenta de coordinación');
  ejecutar('npx tsx prisma/seed.ts');
}
