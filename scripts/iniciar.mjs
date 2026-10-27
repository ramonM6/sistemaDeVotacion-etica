// Prepara y arranca el proyecto con un solo comando (lo usa iniciar.bat en Windows).
//   node scripts/iniciar.mjs [--sin-navegador]
//
// Pasos: verifica Node, instala dependencias si hace falta, comprueba las conexiones
// configuradas de Supabase y ejecuta `npm run dev`. El predev aplica migraciones
// y crea únicamente el coordinador si falta. No requiere ni inicia Docker.
// Solo usa módulos de Node: debe funcionar antes de `npm ci`.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import net from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = join(RAIZ, 'apps', 'api');
const ES_WINDOWS = process.platform === 'win32';
const URL_WEB = 'http://localhost:5173';
const abrirNavegador = !process.argv.includes('--sin-navegador');

const paso = (n, texto) => console.log(`\n[${n}/5] ${texto}`);
const ok = (texto) => console.log(`      OK  ${texto}`);

class ErrorInicio extends Error {}
function fallar(titulo, ...lineas) {
  throw new ErrorInicio([`ERROR: ${titulo}`, ...lineas.map((l) => `  ${l}`)].join('\n'));
}

/**
 * En Windows npm/npx son .cmd y necesitan shell; ahí el comando va como una sola
 * cadena (los argumentos son fijos, sin espacios). La carpeta del proyecto va en `cwd`, así que una
 * ruta con espacios no afecta.
 */
function comandoSO(comando, args) {
  return ES_WINDOWS ? [[comando, ...args].join(' '), [], { shell: true }] : [comando, args, {}];
}

/** Ejecuta un comando mostrando su salida. */
function ejecutar(comando, args) {
  const [c, a, o] = comandoSO(comando, args);
  const r = spawnSync(c, a, { cwd: RAIZ, stdio: 'inherit', ...o });
  if (r.error) throw r.error;
  return r.status ?? 1;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function puertoAbierto(host, puerto, timeout = 1500) {
  return new Promise((ok) => {
    const s = net.connect({ host, port: puerto });
    const fin = (v) => {
      s.destroy();
      ok(v);
    };
    s.setTimeout(timeout, () => fin(false));
    s.once('connect', () => fin(true));
    s.once('error', () => fin(false));
  });
}

/** Lee una variable de un archivo .env sin dependencias (formato CLAVE="valor"). */
function leerVariable(archivo, clave) {
  if (!existsSync(archivo)) return null;
  for (const linea of readFileSync(archivo, 'utf8').split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && m[1] === clave) return m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return null;
}

// ---------------------------------------------------------------------------

function verificarNode() {
  paso(1, 'Verificando Node.js y npm');
  const [mayor] = process.versions.node.split('.').map(Number);
  if (mayor < 20) {
    fallar(`Se necesita Node.js 20 o superior (tienes ${process.versions.node}).`, 'Descarga la versión LTS desde https://nodejs.org e inténtalo de nuevo.');
  }
  ok(`Node.js ${process.versions.node}`);
  const [c, a, o] = comandoSO('npm', ['--version']);
  const npm = spawnSync(c, a, { encoding: 'utf8', ...o });
  if (npm.status !== 0) fallar('No se encontró npm.', 'Reinstala Node.js desde https://nodejs.org (npm viene incluido).');
  ok(`npm ${npm.stdout.trim()}`);
}

function instalarDependencias() {
  paso(2, 'Revisando dependencias');
  const marca = join(RAIZ, 'node_modules', '.package-lock.json');
  const lock = join(RAIZ, 'package-lock.json');
  const desactualizado = !existsSync(marca) || (existsSync(lock) && statSync(lock).mtimeMs > statSync(marca).mtimeMs);
  if (desactualizado) {
    console.log('      Instalando dependencias (la primera vez tarda unos minutos)...');
    if (ejecutar('npm', ['ci']) !== 0) {
      fallar('Falló `npm ci`.', 'Revisa tu conexión a internet y vuelve a ejecutar iniciar.bat.');
    }
  }
  // postinstall de apps/api genera el cliente Prisma; si una instalación se interrumpió, se regenera.
  if (!existsSync(join(RAIZ, 'node_modules', '.prisma', 'client', 'index.js'))) {
    console.log('      Generando el cliente de Prisma...');
    if (ejecutar('npm', ['run', 'postinstall', '-w', 'apps/api']) !== 0) fallar('No se pudo generar el cliente de Prisma.');
  }
  ok('Dependencias instaladas');
}

function conexionesBaseDeDatos() {
  const env = join(API, '.env');
  return ['DATABASE_URL', 'DIRECT_URL'].map((clave) => {
    const valor = process.env[clave] ?? leerVariable(env, clave);
    if (!valor || /YOUR-PASSWORD|\[YOUR-PASSWORD\]/.test(valor)) {
      fallar(`Falta configurar ${clave}.`,
        'Copia apps/api/.env.example a apps/api/.env si todavía no existe.',
        'Completa la contraseña de Supabase en ambas conexiones antes de iniciar.');
    }
    let url;
    try { url = new URL(valor); } catch {
      fallar(`${clave} no es una URL válida.`, 'Revisa apps/api/.env.');
    }
    if (!['postgresql:', 'postgres:'].includes(url.protocol) || !url.hostname || !url.password)
      fallar(`${clave} no es una conexión PostgreSQL completa.`, 'Revisa usuario, contraseña, host y base en apps/api/.env.');
    return { clave, host: url.hostname, puerto: Number(url.port || 5432) };
  });
}

async function prepararBaseDeDatos() {
  paso(3, 'Comprobando las conexiones de PostgreSQL en Supabase');
  for (const { clave, host, puerto } of conexionesBaseDeDatos()) {
    if (!await puertoAbierto(host, puerto, 10_000)) {
      fallar(`No se puede conectar a ${host}:${puerto} (${clave}).`,
        'Comprueba tu conexión a internet, que el proyecto de Supabase esté activo',
        'y que las conexiones de apps/api/.env tengan el host y los puertos correctos.',
        'No necesitas Docker para usar Supabase.');
    }
    ok(`${clave}: conexión accesible en ${host}:${puerto}`);
  }
}

async function verificarPuertos() {
  paso(4, 'Verificando que los puertos estén libres');
  const portApi = Number(process.env.PORT ?? leerVariable(join(API, '.env'), 'PORT') ?? 3000);
  const ocupados = [];
  for (const [nombre, puerto] of [['API', portApi], ['web', 5173]]) {
    if (await puertoAbierto('localhost', puerto, 800)) ocupados.push(`${nombre} (puerto ${puerto})`);
  }
  if (ocupados.length) {
    fallar(
      `Ya hay algo escuchando en: ${ocupados.join(', ')}.`,
      '¿Tienes otra ventana de iniciar.bat abierta? Ciérrala (Ctrl+C) o libera el puerto y vuelve a intentarlo.',
    );
  }
  ok(`Puertos ${portApi} y 5173 libres`);
}

async function abrirCuandoEsteListo() {
  for (let i = 0; i < 180; i++) {
    await esperar(1000);
    try {
      const r = await fetch(URL_WEB);
      if (r.ok) break;
    } catch {
      continue;
    }
  }
  try {
    const [cmd, args] = ES_WINDOWS ? ['explorer.exe', [URL_WEB]] : process.platform === 'darwin' ? ['open', [URL_WEB]] : ['xdg-open', [URL_WEB]];
    spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch {
    // Sin navegador disponible: el usuario puede abrir la URL a mano.
  }
}

function iniciarServicios() {
  paso(5, 'Preparando la base de datos e iniciando la aplicación');
  console.log('      (crea apps/api/.env si falta, aplica migraciones y, crea únicamente el coordinador si falta)');
  console.log(`\n      Web:  ${URL_WEB}`);
  console.log('      API:  http://localhost:3000/api');
  console.log('      Plantillas y ejemplos: Supabase Storage (configurar apps/api/.env).');
  console.log('      Para detenerla presiona Ctrl+C en esta ventana.\n');

  const [c, a, o] = comandoSO('npm', ['run', 'dev']);
  const hijo = spawn(c, a, { cwd: RAIZ, stdio: 'inherit', ...o });
  // Ctrl+C llega también a npm; esperamos a que termine para devolver su código de salida.
  process.on('SIGINT', () => {});
  if (abrirNavegador) abrirCuandoEsteListo();
  hijo.on('exit', (codigo) => process.exit(codigo ?? 0));
  hijo.on('error', (e) => {
    console.error(`ERROR: no se pudo ejecutar npm run dev: ${e.message}`);
    process.exit(1);
  });
}

try {
  console.log('Sistema de Votación de Electivos — inicio');
  console.log(`Carpeta: ${RAIZ}`);
  verificarNode();
  instalarDependencias();
  await prepararBaseDeDatos();
  await verificarPuertos();
  iniciarServicios();
} catch (e) {
  console.error(`\n${e instanceof ErrorInicio ? e.message : `ERROR inesperado: ${e?.stack ?? e}`}`);
  process.exit(1);
}
