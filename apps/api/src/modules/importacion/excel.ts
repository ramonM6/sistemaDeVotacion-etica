import { Readable } from 'stream';
import * as ExcelJS from 'exceljs';

export type Valor = string | number | null;

export interface FilaLeida {
  /** Número de fila en Excel (1 = encabezado). */
  fila: number;
  valores: Record<string, Valor>;
}

export interface HojaLeida {
  filas: FilaLeida[];
  erroresGenerales: string[];
  advertenciasGenerales: string[];
}

export const MAX_FILAS = 20_000;

/** Normaliza un encabezado: minúsculas, sin tildes ni espacios sobrantes. */
export function normalizarEncabezado(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, '_');
}

/**
 * Convierte el valor de una celda a texto o número. Las fórmulas NUNCA se evalúan:
 * solo se usa el último resultado que Excel guardó en el archivo (si existe).
 */
export function valorCelda(v: ExcelJS.CellValue): Valor {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') return v.trim() === '' ? null : v.trim();
  if (typeof v === 'boolean') return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray(v.richText)) {
      return valorCelda(v.richText.map((t) => t.text).join(''));
    }
    if ('formula' in v || 'sharedFormula' in v) {
      return valorCelda((v as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
    }
    if ('text' in v && typeof (v as ExcelJS.CellHyperlinkValue).text === 'string') {
      return valorCelda((v as ExcelJS.CellHyperlinkValue).text);
    }
    if ('error' in v) return null;
  }
  return null;
}

/**
 * Lee una hoja de un .xlsx en memoria. La primera fila son los encabezados.
 * Se ignoran las filas totalmente vacías.
 */
export async function leerHoja(
  archivo: Buffer,
  nombreHoja: string,
  columnasObligatorias: string[],
  columnasOpcionales: string[] = [],
  formato: string = 'xlsx',
): Promise<HojaLeida> {
  const erroresGenerales: string[] = [];
  const advertenciasGenerales: string[] = [];
  const libro = new ExcelJS.Workbook();
  try {
    if (formato === 'csv') {
      const hoja = await libro.csv.read(Readable.from([archivo]), { map: (valor: string) => valor });
      hoja.name = nombreHoja;
    } else await libro.xlsx.load(archivo as unknown as ExcelJS.Buffer);
  } catch {
    return { filas: [], erroresGenerales: ['El archivo no es un Excel .xlsx válido'], advertenciasGenerales };
  }

  let hoja = libro.worksheets.find((h) => h.name.trim().toLowerCase() === nombreHoja);
  if (!hoja) {
    hoja = libro.worksheets.find((h) => h.name.trim().toUpperCase() !== 'LEEME');
    if (!hoja) {
      return { filas: [], erroresGenerales: [`No se encontró la hoja "${nombreHoja}"`], advertenciasGenerales };
    }
    advertenciasGenerales.push(`No se encontró la hoja "${nombreHoja}"; se usó la hoja "${hoja.name}"`);
  }

  const encabezados = new Map<number, string>();
  hoja.getRow(1).eachCell({ includeEmpty: false }, (celda, col) => {
    const texto = valorCelda(celda.value);
    if (texto !== null) encabezados.set(col, normalizarEncabezado(String(texto)));
  });
  const presentes = new Set(encabezados.values());
  if (presentes.size !== encabezados.size) {
    return { filas: [], erroresGenerales: ['El archivo contiene encabezados duplicados'], advertenciasGenerales };
  }
  const faltantes = columnasObligatorias.filter((c) => !presentes.has(c));
  if (faltantes.length) {
    erroresGenerales.push(`Faltan columnas obligatorias: ${faltantes.join(', ')}`);
    return { filas: [], erroresGenerales, advertenciasGenerales };
  }
  const conocidas = new Set([...columnasObligatorias, ...columnasOpcionales]);
  const desconocidas = [...presentes].filter((c) => !conocidas.has(c));
  if (desconocidas.length) advertenciasGenerales.push(`Columnas ignoradas: ${desconocidas.join(', ')}`);

  const filas: FilaLeida[] = [];
  const total = hoja.actualRowCount;
  if (total - 1 > MAX_FILAS) {
    erroresGenerales.push(`El archivo tiene demasiadas filas (máximo ${MAX_FILAS})`);
    return { filas: [], erroresGenerales, advertenciasGenerales };
  }

  hoja.eachRow({ includeEmpty: false }, (fila, numero) => {
    if (numero === 1) return;
    const valores: Record<string, Valor> = {};
    for (const c of conocidas) valores[c] = null;
    let vacia = true;
    for (const [col, nombre] of encabezados) {
      if (!conocidas.has(nombre)) continue;
      const v = valorCelda(fila.getCell(col).value);
      valores[nombre] = v;
      if (v !== null) vacia = false;
    }
    if (!vacia) filas.push({ fila: numero, valores });
  });

  if (!filas.length) erroresGenerales.push('El archivo no tiene filas de datos');
  return { filas, erroresGenerales, advertenciasGenerales };
}

/** Texto de una celda; los números (ej. códigos de alumno guardados como número) se pasan a texto. */
export function texto(v: Valor): string | null {
  return v === null ? null : String(v).trim() || null;
}
