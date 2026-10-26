import { Prisma, PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { CursoImportado } from './validadores/catalogo';
import { CuentaImportada } from './validadores/cuentas';
import { HistorialImportado } from './validadores/historial';

/**
 * Aplicación de importaciones ya validadas. Son funciones sobre un cliente de Prisma para que
 * las use tanto el servicio de importación como el seed.
 */
type Db = PrismaClient | Prisma.TransactionClient;

export interface ResumenCatalogo {
  creados: number;
  actualizados: number;
  eliminados: number;
  conservadosConVotos: string[];
}

/**
 * Reemplaza el catálogo (global). Si la celda de descripción viene vacía, se conserva la
 * descripción editada en el sistema. Los cursos que ya no vienen en el archivo se eliminan,
 * salvo los que tienen votos (se conservan para no perder resultados).
 */
export async function aplicarCatalogo(db: Db, cursos: CursoImportado[]): Promise<ResumenCatalogo> {
  const existentes = await db.curso.findMany({ select: { codigo: true, _count: { select: { votos: true } } } });
  const procesos = await db.procesoVotacion.findMany({
    where: { catalogo: { not: Prisma.DbNull } },
    select: { catalogo: true },
  });
  const congelados = new Set(
    procesos.flatMap((p) => (Array.isArray(p.catalogo) ? p.catalogo.map((c) => (c as { codigo: string }).codigo) : [])),
  );
  const codigosArchivo = new Set(cursos.map((c) => c.codigo));
  const existentesSet = new Set(existentes.map((c) => c.codigo));

  for (const c of cursos) {
    const datos = {
      activo: true,
      nombre: c.nombre,
      creditos: new Prisma.Decimal(c.creditos),
      tipo: c.tipo,
      ciclo: c.ciclo,
      grupo: c.grupo,
      requisitosTexto: c.requisitos,
    };
    await db.curso.upsert({
      where: { codigo: c.codigo },
      create: { codigo: c.codigo, ...datos, descripcion: c.descripcion },
      update: { ...datos, ...(c.descripcion ? { descripcion: c.descripcion } : {}) },
    });
  }

  await db.requisito.deleteMany({ where: { cursoCodigo: { in: [...codigosArchivo] } } });
  const requisitos = cursos.flatMap((c) =>
    c.terminos.map((t, orden) => ({
      cursoCodigo: c.codigo,
      orden,
      texto: t.texto,
      tipo: t.tipo,
      cursoRequerido: t.cursoRequerido ?? null,
      creditosMinimos: t.creditosMinimos ?? null,
    })),
  );
  if (requisitos.length) await db.requisito.createMany({ data: requisitos });

  const sobrantes = existentes.filter((c) => !codigosArchivo.has(c.codigo));
  const conservados = sobrantes.filter((c) => c._count.votos > 0 || congelados.has(c.codigo)).map((c) => c.codigo);
  if (conservados.length)
    await db.curso.updateMany({ where: { codigo: { in: conservados } }, data: { activo: false } });
  const eliminables = sobrantes.filter((c) => c._count.votos === 0 && !congelados.has(c.codigo)).map((c) => c.codigo);
  if (eliminables.length) await db.curso.deleteMany({ where: { codigo: { in: eliminables } } });

  return {
    creados: cursos.filter((c) => !existentesSet.has(c.codigo)).length,
    actualizados: cursos.filter((c) => existentesSet.has(c.codigo)).length,
    eliminados: eliminables.length,
    conservadosConVotos: sobrantes.filter((c) => c._count.votos > 0).map((c) => c.codigo),
  };
}

/** Hashea las contraseñas (bcrypt) antes de abrir la transacción, que no debe durar tanto. */
export async function hashearCuentas(cuentas: CuentaImportada[], cost = 10) {
  const resultado: (Omit<CuentaImportada, 'password'> & { passwordHash: string })[] = [];
  for (const { password, ...resto } of cuentas) {
    resultado.push({ ...resto, passwordHash: await bcrypt.hash(password, cost) });
  }
  return resultado;
}

/**
 * Crea o actualiza las cuentas de alumno y reemplaza el padrón del proceso:
 * solo los alumnos del archivo quedan habilitados para entrar y votar.
 */
export async function aplicarCuentas(
  db: Db,
  procesoId: string,
  cuentas: Awaited<ReturnType<typeof hashearCuentas>>,
): Promise<{ creadas: number; actualizadas: number; habilitados: number }> {
  const existentes = await db.usuario.findMany({
    where: { codigo: { in: cuentas.map((c) => c.codigo) } },
    select: { codigo: true, rol: true },
  });
  const coordinadores = existentes.filter((u) => u.rol !== 'ALUMNO').map((u) => u.codigo);
  if (coordinadores.length) throw new Error(`Códigos reservados para coordinación: ${coordinadores.join(', ')}`);
  const yaExisten = new Set(existentes.map((u) => u.codigo));

  const ids: string[] = [];
  for (const c of cuentas) {
    const datos = { nombres: c.nombres, apellidos: c.apellidos, correo: c.correo, passwordHash: c.passwordHash };
    const u = await db.usuario.upsert({
      where: { codigo: c.codigo },
      create: { codigo: c.codigo, rol: 'ALUMNO', ...datos },
      update: datos,
      select: { id: true },
    });
    ids.push(u.id);
  }

  await db.padronAlumno.deleteMany({ where: { procesoId } });
  await db.padronAlumno.createMany({
    data: ids.map((usuarioId, i) => ({
      procesoId,
      usuarioId,
      ingreso: cuentas[i].ingreso,
      craest: cuentas[i].craest,
      matriculado: cuentas[i].matriculado,
    })),
  });

  return {
    creadas: cuentas.filter((c) => !yaExisten.has(c.codigo)).length,
    actualizadas: cuentas.filter((c) => yaExisten.has(c.codigo)).length,
    habilitados: ids.length,
  };
}

/** Reemplaza el historial académico del proceso. */
export async function aplicarHistorial(
  db: Db,
  procesoId: string,
  items: HistorialImportado[],
): Promise<{ filas: number; alumnos: number }> {
  const codigos = [...new Set(items.map((i) => i.codigoAlumno))];
  const usuarios = await db.usuario.findMany({
    where: { codigo: { in: codigos }, padron: { some: { procesoId } } },
    select: { id: true, codigo: true },
  });
  const idPorCodigo = new Map(usuarios.map((u) => [u.codigo, u.id]));
  const faltantes = codigos.filter((c) => !idPorCodigo.has(c));
  if (faltantes.length) throw new Error(`Alumnos fuera del padrón: ${faltantes.join(', ')}`);

  await db.historialItem.deleteMany({ where: { procesoId } });
  await db.historialItem.createMany({
    data: items.map((i) => ({
      procesoId,
      usuarioId: idPorCodigo.get(i.codigoAlumno)!,
      cursoCodigo: i.codigoCurso,
      nota: i.nota,
    })),
  });
  return { filas: items.length, alumnos: codigos.length };
}
