import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { urlBaseDePruebas } from './url-test';

/**
 * Prepara la base de pruebas (<base>_test): la crea si no existe y aplica las migraciones.
 * No toca la base de desarrollo; cada suite vacía las tablas de la base de pruebas al empezar.
 */
export default async function globalSetup() {
  const url = new URL(urlBaseDePruebas());
  const nombre = url.pathname.slice(1);
  if (!/^[a-zA-Z0-9_]+_test$/.test(nombre)) throw new Error(`La base de pruebas debe terminar en _test (es "${nombre}")`);

  const admin = new URL(url.toString());
  admin.pathname = '/postgres';
  const prisma = new PrismaClient({ datasources: { db: { url: admin.toString() } } });
  try {
    const existe = await prisma.$queryRaw<unknown[]>`SELECT 1 FROM pg_database WHERE datname = ${nombre}`;
    if (!existe.length) await prisma.$executeRawUnsafe(`CREATE DATABASE "${nombre}"`);
  } finally {
    await prisma.$disconnect();
  }

  execSync('npx prisma migrate deploy', {
    cwd: resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: url.toString(), DIRECT_URL: url.toString() },
    stdio: 'pipe',
  });
}
