import PDFDocument from 'pdfkit';
import { FiltrosResultadosDto } from '../resultados/filtros.dto';
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

  async resultadosPdf(procesoId: string | undefined, filtros: FiltrosResultadosDto) {
    const datos = await this.resultados.coordinador(procesoId, filtros.aptitud as Aptitud | undefined, filtros);
    const doc = new PDFDocument({ size: 'A4', margin: 45, bufferPages: true });
    const partes: Buffer[] = [];
    const fin = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (b) => partes.push(b));
      doc.on('end', () => resolve(Buffer.concat(partes)));
      doc.on('error', reject);
    });
    const texto = (t: string, size = 10) => {
      if (doc.y > 730) doc.addPage();
      doc.fontSize(size).fillColor('#172c4a').text(t);
      doc.moveDown(0.4);
    };
    texto('Sondeo de electivos · Ingeniería Informática PUCP', 17);
    texto(`${datos.proceso.nombre} · ${datos.proceso.cicloObjetivo}`, 13);
    texto(`Generado: ${new Date().toLocaleString('es-PE', { timeZone: 'America/Lima' })}`);
    texto(
      `Filtros: ingreso ${filtros.ingreso ?? 'todos'}; CRAEst ${filtros.craestMin ?? 0} a ${filtros.craestMax ?? 100}; matrícula ${filtros.matriculado ?? 'todos'}; aptitud ${filtros.aptitud ?? 'todas'}`,
    );
    if (filtros.estadisticas !== 'no') {
      texto('Estadísticas', 13);
      texto(
        `Habilitados: ${datos.indicadores.habilitados} · Participantes: ${datos.indicadores.votaron} · Participación: ${datos.indicadores.participacion}% · Votos: ${datos.indicadores.totalVotos}`,
      );
    }
    if (filtros.tabla !== 'no') {
      texto('Ranking de electivos', 13);
      for (const f of datos.ranking)
        texto(`${f.codigo} · ${f.nombre}
${f.total} votos · ${f.confirmados} confirmados · ${f.condicionales} condicionales\nSelección: ${f.seleccion} · Consejo: ${f.consejo} · Dictado: ${f.dictado}`);
    }
    if (filtros.graficos !== 'no') {
      texto('Demanda por curso', 13);
      const maximo = Math.max(1, ...datos.ranking.map((f) => f.total));
      for (const f of datos.ranking) {
        if (doc.y > 700) doc.addPage();
        texto(`${f.codigo} · ${f.total} votos`);
        doc.rect(45, doc.y, (450 * f.total) / maximo, 9).fill('#2563eb');
        doc.y += 19;
      }
    }
    if (filtros.agrupaciones !== 'no') {
      texto('Agrupaciones de participantes', 13);
      for (const g of datos.agrupaciones)
        texto(`${g.codigo} · ${g.grupo}: ${g.alumnos} participantes de ${g.poblacion} habilitados · ${g.votos} votos`);
    }
    texto('Resultados referenciales. No garantizan la apertura de cursos u horarios.');
    doc.end();
    return { buffer: await fin, nombre: `resultados-${datos.proceso.cicloObjetivo}.pdf` };
  }

  async resultadosXlsx(procesoId?: string) {
    const proceso = await this.procesos.resolver(procesoId);
    const [ranking, indicadores] = await Promise.all([
      this.resultados.ranking(proceso.id),
      this.resultados.indicadores(proceso.id),
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
