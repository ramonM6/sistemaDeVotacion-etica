import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { Download, Percent, UserCheck, Users, Vote } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Cargando, ErrorCarga, Titulo, Vacio } from '@/components/Estados';
import { MapaCalor, RankingApilado } from '@/components/Graficos';
import { Indicador } from '@/components/Indicador';
import { EnVivo, EstadoProcesoBadge } from '@/components/Insignias';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import type { Aptitud } from '@/lib/tipos';
import { cn } from '@/lib/utils';
import { useResultadosEnVivo } from '@/lib/socket';
import { SelectorProceso, useProcesoSeleccionado } from './LayoutCoord';

/** Dashboard de resultados en vivo del coordinador. */
export default function Resultados() {
  const { procesoId } = useProcesoSeleccionado();
  const navigate = useNavigate();
  const [aptitud, setAptitud] = useState<Aptitud | undefined>();
  const [filtros, setFiltros] = useState<Record<string, string>>({});
  const [secciones, setSecciones] = useState<Record<string, string>>({
    tabla: 'si',
    graficos: 'si',
    estadisticas: 'si',
    agrupaciones: 'si',
  });
  const consulta = useQuery({
    queryKey: ['coord', 'resultados', procesoId, aptitud ?? null, filtros],
    queryFn: () => api.resultadosCoord(procesoId, aptitud, filtros),
  });
  const conectado = useResultadosEnVivo([['coord', 'resultados']]);
  const irA = (codigo: string) => navigate(`/coord/resultados/${codigo}`);

  if (consulta.isLoading) return <Cargando />;
  if (consulta.error) return <ErrorCarga error={consulta.error} />;
  const { proceso, indicadores, ranking } = consulta.data!;

  return (
    <div className="space-y-6">
      <Titulo
        titulo="Resultados"
        descripcion={
          <span className="inline-flex items-center gap-2">
            {proceso.nombre} <EstadoProcesoBadge estado={proceso.estado} />
          </span>
        }
        acciones={
          <>
            <SelectorProceso />
            <EnVivo conectado={conectado} />
            <Button asChild>
              <a href={api.urlExportResultados(procesoId)} download>
                <Download /> Exportar Excel
              </a>
            </Button>
          </>
        }
      />

      <Card className="space-y-3 p-4">
        <p className="font-medium">Filtros de resultados y reporte</p>
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            ['ingreso', 'Ciclo de ingreso', 1900, 2200],
            ['craestMin', 'CRAEst mínimo', 0, 100],
            ['craestMax', 'CRAEst máximo', 0, 100],
          ].map(([campo, etiqueta, min, max]) => (
            <label key={campo} className="text-sm">
              {etiqueta}
              <Input
                type={campo === 'ingreso' ? 'text' : 'number'}
                placeholder={campo === 'ingreso' ? '2020.1' : undefined}
                min={Number(min)}
                max={Number(max)}
                value={filtros[String(campo)] ?? ''}
                onChange={(e) => setFiltros((f) => ({ ...f, [campo]: e.target.value }))}
              />
            </label>
          ))}
          <label className="text-sm">
            Matrícula
            <Select
              value={filtros.matriculado ?? ''}
              onChange={(e) => setFiltros((f) => ({ ...f, matriculado: e.target.value }))}
            >
              <option value="">Todos</option>
              <option value="si">Matriculados</option>
              <option value="no">No matriculados</option>
            </Select>
          </label>
        </div>
        <label className="block max-w-sm text-sm">
          Agrupar por
          <Select value={filtros.grupo ?? ''} onChange={(e) => setFiltros((f) => ({ ...f, grupo: e.target.value }))}>
            <option value="">Todas las agrupaciones</option>
            <option value="ingreso">Ciclo de ingreso</option>
            <option value="craest">CRAEst</option>
            <option value="matricula">Matrícula</option>
          </Select>
        </label>
        <div className="flex flex-wrap gap-4">
          {Object.entries({
            tabla: 'Tabla',
            graficos: 'Gráficos',
            estadisticas: 'Estadísticas',
            agrupaciones: 'Agrupaciones',
          }).map(([campo, texto]) => (
            <label key={campo} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={secciones[campo] === 'si'}
                onChange={(e) => setSecciones((s) => ({ ...s, [campo]: e.target.checked ? 'si' : 'no' }))}
              />
              {texto}
            </label>
          ))}
        </div>
        <Button asChild variant="outline">
          <a href={api.urlReportePdf(procesoId, aptitud, { ...filtros, ...secciones })} download>
            Descargar reporte PDF
          </a>
        </Button>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador titulo="Alumnos habilitados" valor={indicadores.habilitados} icono={Users} />
        <Indicador titulo="Alumnos que votaron" valor={indicadores.votaron} icono={UserCheck} />
        <Indicador
          titulo="Participación"
          valor={`${indicadores.participacion.toLocaleString('es-PE')} %`}
          icono={Percent}
        />
        <Indicador titulo="Total de votos" valor={indicadores.totalVotos} icono={Vote} />
      </div>

      <div className="inline-flex rounded-md border bg-background p-1" role="group" aria-label="Filtro por aptitud">
        {[
          { valor: undefined, texto: 'Todos los votos' },
          { valor: 'CONFIRMADO' as const, texto: 'Solo confirmados' },
          { valor: 'CONDICIONAL' as const, texto: 'Solo condicionales' },
        ].map((o) => (
          <button
            key={o.texto}
            onClick={() => setAptitud(o.valor)}
            aria-pressed={aptitud === o.valor}
            className={cn(
              'rounded px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors',
              aptitud === o.valor && 'bg-primary text-primary-foreground',
            )}
          >
            {o.texto}
          </button>
        ))}
      </div>

      <Card className="p-4">
        <h2 className="mb-2 font-semibold">Agrupaciones</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {consulta.data!.agrupaciones.map((g) => (
            <p key={`${g.codigo}-${g.grupo}`} className="text-sm">
              {g.codigo} · {g.grupo}: {g.alumnos} participantes de {g.poblacion} habilitados · {g.votos} votos
            </p>
          ))}
        </div>
      </Card>
      {ranking.length === 0 ? (
        <Vacio>{aptitud ? 'No hay votos confirmados todavía.' : 'Todavía no hay votos registrados.'}</Vacio>
      ) : (
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ranking de electivos</CardTitle>
              <CardDescription>
                Votos confirmados y condicionales por curso. Haz clic para ver el detalle.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RankingApilado datos={ranking} alSeleccionar={irA} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mapa de calor curso × franja</CardTitle>
              <CardDescription>Cada voto suma 1 en cada franja marcada. Ordenado por total de votos.</CardDescription>
            </CardHeader>
            <CardContent>
              <MapaCalor filas={ranking} alSeleccionar={irA} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
