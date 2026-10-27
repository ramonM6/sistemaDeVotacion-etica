import { Aptitud } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { FRANJAS } from '../../common/franjas';
import { ProcesosService } from '../procesos/procesos.service';
import { ResultadosService } from '../resultados/resultados.service';

function estilizarEncabezado(hoja: ExcelJS.Worksheet) {
  const fila = hoja.getRow(1);
  fila.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A60' } };
  hoja.views = [{ state: 'frozen', ySplit: 1 }];
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: hoja.columnCount } };
}

/**
 * Exportación a Excel. Usa exactamente las mismas consultas que el dashboard, de modo que la
 * hoja "Matriz franjas" coincide con el mapa de calor.
 */
@Injectable()
export class ExportService {
  constructor(
    private readonly resultados: ResultadosService,
    private readonly procesos: ProcesosService,
  ) {}

  async resultadosXlsx(procesoId?: string, aptitud?: Aptitud) {
    const proceso = await this.procesos.resolver(procesoId);
    const [ranking, indicadores] = await Promise.all([
      this.resultados.ranking(proceso.id, aptitud),
      this.resultados.indicadores(proceso.id, aptitud),
    ]);

    const libro = new ExcelJS.Workbook();
    libro.creator = 'Sistema de votación de electivos';
    libro.created = new Date();

    const hRanking = libro.addWorksheet('Ranking');
    hRanking.columns = [
      { header: 'Puesto', key: 'puesto', width: 8 },
      { header: 'Código', key: 'codigo', width: 10 },
      { header: 'Curso', key: 'nombre', width: 55 },
      { header: 'Créditos', key: 'creditos', width: 10 },
      { header: 'Votos', key: 'total', width: 8 },
      { header: 'Confirmados', key: 'confirmados', width: 13 },
      { header: 'Condicionales', key: 'condicionales', width: 14 },
      { header: 'Selección', key: 'seleccion', width: 30 },
      { header: 'Consejo', key: 'consejo', width: 20 },
      { header: 'Dictado', key: 'dictado', width: 20 },
    ];
    ranking.forEach((f, i) => hRanking.addRow({ puesto: i + 1, ...f }));
    estilizarEncabezado(hRanking);
    hRanking.addRow([]);
    hRanking.addRow(['Proceso', proceso.nombre]);
    hRanking.addRow(['Filtro', aptitud ?? 'Todos los votos']);
    hRanking.addRow(['Alumnos habilitados', indicadores.habilitados]);
    hRanking.addRow(['Alumnos que votaron', indicadores.votaron]);
    hRanking.addRow(['Participación (%)', indicadores.participacion]);
    hRanking.addRow(['Total de votos', indicadores.totalVotos]);
    hRanking.addRow(['Exportado', new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })]);

    const hMatriz = libro.addWorksheet('Matriz franjas');
    hMatriz.columns = [
      { header: 'Código', key: 'codigo', width: 10 },
      { header: 'Curso', key: 'nombre', width: 55 },
      ...FRANJAS.map((f) => ({ header: `${f.etiqueta} (${f.horario})`, key: f.valor, width: 18 })),
      { header: 'Votos', key: 'total', width: 8 },
    ];
    for (const f of ranking) hMatriz.addRow({ codigo: f.codigo, nombre: f.nombre, ...f.franjas, total: f.total });
    estilizarEncabezado(hMatriz);

    return { buffer: Buffer.from(await libro.xlsx.writeBuffer()), nombre: `resultados-${proceso.cicloObjetivo}.xlsx` };
  }

  async cursoXlsx(codigo: string, procesoId?: string) {
    const detalle = await this.resultados.detalleCurso(codigo, procesoId);
    const libro = new ExcelJS.Workbook();
    const hoja = libro.addWorksheet('Resumen');
    hoja.columns = [
      { header: 'Dato', key: 'dato', width: 24 },
      { header: 'Valor', key: 'valor', width: 60 },
    ];
    hoja.addRows([
      { dato: 'Curso', valor: `${detalle.curso.codigo} · ${detalle.curso.nombre}` },
      { dato: 'Votos', valor: detalle.total },
      { dato: 'Confirmados', valor: detalle.confirmados },
      { dato: 'Condicionales', valor: detalle.condicionales },
    ]);
    estilizarEncabezado(hoja);

    const hFranjas = libro.addWorksheet('Franjas');
    hFranjas.columns = [
      { header: 'Franja', key: 'franja', width: 16 },
      { header: 'Horario', key: 'horario', width: 16 },
      { header: 'Votos', key: 'votos', width: 8 },
    ];
    for (const f of FRANJAS)
      hFranjas.addRow({ franja: f.etiqueta, horario: f.horario, votos: detalle.franjas[f.valor] });
    estilizarEncabezado(hFranjas);

    return { buffer: Buffer.from(await libro.xlsx.writeBuffer()), nombre: `resultados-${detalle.curso.codigo}.xlsx` };
  }
}
