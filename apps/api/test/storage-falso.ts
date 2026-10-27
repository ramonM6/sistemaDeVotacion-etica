import { createHash, randomUUID } from 'crypto';
import * as ExcelJS from 'exceljs';
import { ServiceUnavailableException } from '@nestjs/common';
import { RECURSOS, recurso, type ClaseRecurso } from '../src/modules/importacion/recursos';
/** Solo pruebas: nunca se usa como alternativa de almacenamiento en ejecución normal. */
export class StorageFalso {
  readonly archivos = new Map<string, Buffer>();
  readonly recursos = new Map<string, Buffer>();
  async prepararRecursos() {
    const filas = {
      malla: [
        ['codigo', 'nombre', 'creditos', 'tipo'],
        ['INF101', 'Curso base de prueba', 3, 'OBLIGATORIO'],
        ['INF201', 'Electivo de prueba', 3, 'ELECTIVO'],
      ],
      cuentas: [
        ['codigo', 'nombres', 'apellidos', 'password'],
        ['20990001', 'Ana', 'Prueba', 'Alumno#2026'],
      ],
      historial: [
        ['codigo_alumno', 'codigo_curso', 'nota'],
        ['20990001', 'INF101', 15],
      ],
    };
    for (const clase of Object.keys(RECURSOS) as ClaseRecurso[])
      for (const tipo of Object.keys(RECURSOS[clase]) as (keyof typeof filas)[]) {
        const libro = new ExcelJS.Workbook();
        const hoja = libro.addWorksheet(tipo === 'malla' ? 'cursos' : tipo === 'cuentas' ? 'alumnos' : 'historial');
        for (const fila of filas[tipo]) hoja.addRow(fila);
        const contenido =
          clase === 'plantillas'
            ? Buffer.from(await libro.xlsx.writeBuffer())
            : Buffer.from(filas[tipo].map((f) => f.join(',')).join('\n'));
        this.recursos.set(recurso(clase, tipo).ruta, contenido);
      }
  }
  async subir(_nombre: string, contenido: Buffer, prefijo: string) {
    const ruta = `${prefijo}/${randomUUID()}`;
    this.archivos.set(ruta, Buffer.from(contenido));
    return { bucket: 'pruebas', ruta, sha256: createHash('sha256').update(contenido).digest('hex') };
  }
  async descargar(_bucket: string, ruta: string) {
    const contenido = this.recursos.get(ruta) ?? this.archivos.get(ruta);
    if (!contenido) throw new ServiceUnavailableException('Recurso no disponible en Storage');
    return Buffer.from(contenido);
  }
  async eliminar(_bucket: string, ruta: string) {
    this.archivos.delete(ruta);
  }
}
