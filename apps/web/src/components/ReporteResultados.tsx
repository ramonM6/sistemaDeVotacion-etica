import { Percent, UserCheck, Users, Vote } from 'lucide-react';
import { Indicador } from './Indicador';
import { MapaCalor, RankingApilado } from './Graficos';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import type { ResultadosCoord } from '@/lib/tipos';

export function ReporteResultados({ datos }: { datos: ResultadosCoord }) {
  const { indicadores, ranking, proceso, filtroAptitud } = datos;
  const filtro =
    filtroAptitud === 'CONFIRMADO'
      ? 'Solo confirmados'
      : filtroAptitud === 'CONDICIONAL'
        ? 'Solo condicionales'
        : 'Todos los votos';
  const encabezado = (
    <div className="mb-6">
      <h1 className="text-2xl font-bold">Resultados · {proceso.nombre}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {proceso.cicloObjetivo} · Filtro: {filtro}
      </p>
    </div>
  );
  return (
    <div className="bg-background text-foreground">
      <section data-reporte-pagina className="p-6">
        {encabezado}
        <div className="grid grid-cols-2 gap-4">
          <Indicador titulo="Alumnos habilitados" valor={indicadores.habilitados} icono={Users} />
          <Indicador titulo="Alumnos que votaron" valor={indicadores.votaron} icono={UserCheck} />
          <Indicador
            titulo="Participación"
            valor={`${indicadores.participacion.toLocaleString('es-PE')} %`}
            icono={Percent}
          />
          <Indicador titulo="Total de votos" valor={indicadores.totalVotos} icono={Vote} />
        </div>
      </section>
      <section data-reporte-pagina className="p-6">
        {encabezado}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ranking de electivos</CardTitle>
            <CardDescription>Votos confirmados y condicionales por curso.</CardDescription>
          </CardHeader>
          <CardContent>
            {ranking.length ? (
              <RankingApilado datos={ranking} animar={false} />
            ) : (
              <p className="text-sm text-muted-foreground">No hay votos para el filtro seleccionado.</p>
            )}
          </CardContent>
        </Card>
      </section>
      <section data-reporte-pagina className="p-6">
        {encabezado}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mapa de calor curso × franja</CardTitle>
            <CardDescription>Cada voto suma 1 en cada franja marcada. Ordenado por total de votos.</CardDescription>
          </CardHeader>
          <CardContent>
            {ranking.length ? (
              <MapaCalor filas={ranking} />
            ) : (
              <p className="text-sm text-muted-foreground">No hay votos para el filtro seleccionado.</p>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

export async function descargarGraficos(elemento: HTMLElement, datos: ResultadosCoord) {
  const [{ toCanvas }, { jsPDF }] = await Promise.all([import('html-to-image'), import('jspdf')]);
  let pdf: InstanceType<typeof jsPDF> | undefined;
  for (const pagina of elemento.querySelectorAll<HTMLElement>('[data-reporte-pagina]')) {
    const canvas = await toCanvas(pagina, { backgroundColor: '#f8fafc', pixelRatio: 2, skipFonts: true });
    // Cada gráfico ocupa una página completa de altura variable, sin cortar filas ni deformarlo.
    const ancho = 842;
    const altoImagen = (canvas.height * ancho) / canvas.width;
    const alto = Math.max(595, altoImagen);
    const orientation = alto > ancho ? 'portrait' : 'landscape';
    if (!pdf) pdf = new jsPDF({ unit: 'pt', format: [ancho, alto], orientation, compress: true });
    else pdf.addPage([ancho, alto], orientation);
    pdf.addImage(canvas, 'PNG', 0, 0, ancho, altoImagen, undefined, 'FAST');
  }
  if (!pdf) throw new Error('No hay gráficos para exportar');
  pdf.setProperties({ title: `Resultados ${datos.proceso.nombre}`, subject: datos.filtroAptitud ?? 'Todos los votos' });
  await pdf.save(`resultados-${datos.proceso.cicloObjetivo}-${datos.filtroAptitud?.toLowerCase() ?? 'todos'}.pdf`, {
    returnPromise: true,
  });
}
