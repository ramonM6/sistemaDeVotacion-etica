import { HojaLeida, texto } from '../excel';
import { FilaPreview, RE_CODIGO_ALUMNO, ResultadoValidacion } from './tipos';

export const COLUMNAS_CUENTAS = ['codigo', 'nombres', 'apellidos', 'password'];
export const COLUMNAS_CUENTAS_OPCIONALES = ['correo', 'ingreso', 'craest', 'matriculado'];

const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CuentaImportada {
  codigo: string;
  nombres: string;
  apellidos: string;
  correo: string | null;
  password: string;
  ingreso?: string | null;
  craest?: number | null;
  matriculado?: boolean | null;
}

/** Datos de la cuenta que se muestran en la vista previa (nunca la contraseña). */
export type CuentaPreview = Omit<CuentaImportada, 'password'>;

export function validarCuentas(
  hoja: HojaLeida,
  codigosReservados: Set<string> = new Set(),
): ResultadoValidacion<CuentaImportada> {
  const filas: FilaPreview<CuentaImportada>[] = [];
  const primeraFila = new Map<string, number>();

  for (const { fila, valores } of hoja.filas) {
    const errores: string[] = [];
    const advertencias: string[] = [];

    const codigo = texto(valores.codigo) ?? '';
    if (!codigo) errores.push('Falta el código');
    else if (!RE_CODIGO_ALUMNO.test(codigo)) errores.push(`Código "${codigo}" inválido: deben ser 8 dígitos`);
    else if (codigosReservados.has(codigo)) errores.push('El código pertenece a una cuenta de coordinación');
    else if (primeraFila.has(codigo))
      errores.push(`Código duplicado (ya aparece en la fila ${primeraFila.get(codigo)})`);
    else primeraFila.set(codigo, fila);

    const nombres = texto(valores.nombres) ?? '';
    const apellidos = texto(valores.apellidos) ?? '';
    if (!nombres) errores.push('Faltan los nombres');
    if (!apellidos) errores.push('Faltan los apellidos');
    if (nombres.length > 120 || apellidos.length > 120) errores.push('Nombres o apellidos demasiado largos');

    const correo = texto(valores.correo);
    if (correo && !RE_CORREO.test(correo)) advertencias.push(`Correo "${correo}" con formato inválido`);

    // Las contraseñas no se recortan: los espacios son parte de la contraseña.
    const password = valores.password === null ? '' : String(valores.password);
    if (!password) errores.push('Falta la contraseña');
    else if (password.length < 8) errores.push('La contraseña debe tener al menos 8 caracteres');
    else if (Buffer.byteLength(password, 'utf8') > 72) errores.push('La contraseña no puede superar los 72 bytes');

    const ingresoTexto = texto(valores.ingreso);
    const craestTexto = texto(valores.craest);
    const matriculaTexto = texto(valores.matriculado)?.toLowerCase();
    const ingreso = ingresoTexto?.replace('-', '.') ?? null;
    const craest = craestTexto ? Number(craestTexto) : null;
    const matriculado = matriculaTexto ? ['si', 'sí', 'true', '1'].includes(matriculaTexto) : null;
    if (ingreso !== null && !/^(19|20|21|22)\d{2}(?:\.[12])?$/.test(ingreso))
      errores.push('Ingreso debe tener formato AAAA o AAAA.1/AAAA.2');
    if (craest !== null && (!Number.isFinite(craest) || craest < 0 || craest > 100))
      errores.push('CRAEst debe estar entre 0 y 100');
    if (matriculaTexto && !['si', 'sí', 'no', 'true', 'false', '1', '0'].includes(matriculaTexto))
      errores.push('Matriculado debe ser si o no');
    filas.push({
      fila,
      datos: { codigo, nombres, apellidos, correo, password, ingreso, craest, matriculado },
      errores,
      advertencias,
    });
  }
  return {
    filas,
    erroresGenerales: [...hoja.erroresGenerales],
    advertenciasGenerales: [...hoja.advertenciasGenerales],
  };
}
