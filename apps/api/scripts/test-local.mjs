// Base efímera para integración: no lee .env ni se conecta a PostgreSQL existente.
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const raiz = fileURLToPath(new URL('../', import.meta.url));
const db = await PGlite.create();
for (const dir of (await readdir(`${raiz}prisma/migrations`, { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .sort((a, b) => a.name.localeCompare(b.name))) {
  await db.exec(await readFile(`${raiz}prisma/migrations/${dir.name}/migration.sql`, 'utf8'));
}
const server = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 54339, maxConnections: 20 });
await server.start();
const hijo = spawn(
  process.execPath,
  [`${raiz}../../node_modules/jest/bin/jest.js`, '--config', 'test/jest-local.config.js', '--runInBand'],
  {
    cwd: raiz,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL_TEST:
        'postgresql://postgres:postgres@127.0.0.1:54339/votacion_test?sslmode=disable&connection_limit=1',
    },
  },
);
const codigo = await new Promise((resolve) => {
  hijo.on('exit', (code) => resolve(code ?? 1));
  hijo.on('error', () => resolve(1));
});
await server.stop();
await db.close();
process.exitCode = codigo;
