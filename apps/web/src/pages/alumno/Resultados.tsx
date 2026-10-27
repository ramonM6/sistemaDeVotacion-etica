import { EstadoCursoBadge } from '@/components/EstadoCursoBadge';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Cargando, ErrorCarga, Titulo, Vacio } from '@/components/Estados';
import { DistribucionFranjas, RankingBarras } from '@/components/Graficos';
import { EnVivo } from '@/components/Insignias';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useResultadosEnVivo } from '@/lib/socket';

/** Resultados agregados disponibles para alumnos después del cierre. */
export default function Resultados() {
  const consulta = useQuery({
    queryKey: ['resultados', 'publicos'],
    queryFn: api.resultadosPublicos,
    refetchInterval: 30_000,
  });
  const conectado = useResultadosEnVivo([['resultados', 'publicos']]);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);

  if (consulta.isLoading) return <Cargando />;
  if (consulta.error) return <ErrorCarga error={consulta.error} />;
  const { ranking, totalVotos, proceso } = consulta.data!;
  const elegido = ranking.find((r) => r.codigo === seleccionado) ?? ranking[0];

  return (
    <div>
      <Titulo
        titulo="Resultados"
        descripcion={`${proceso.nombre} · ${totalVotos} votos en total. Los resultados son referenciales y no muestran quién votó.`}
        acciones={<EnVivo conectado={conectado} />}
      />
      {proceso.estado === 'CERRADO' && (
        <Card className="mb-4 p-4">
          <h2 className="mb-2 font-semibold">Decisiones de apertura</h2>
          {ranking.map((f) => (
            <p key={f.codigo} className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              {f.codigo} · {f.nombre}:{' '}
              <EstadoCursoBadge
                estado={f.dictado}
                texto={!f.dictado || f.dictado === 'PENDIENTE' ? 'Pendiente de decisión' : undefined}
              />
            </p>
          ))}
        </Card>
      )}
      {proceso.estado !== 'CERRADO' ? (
        <Vacio>Los resultados estarán disponibles al cierre de la votación.</Vacio>
      ) : ranking.length === 0 ? (
        <Vacio>Todavía no hay votos registrados.</Vacio>
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="text-base">Ranking de electivos por número de votos</CardTitle>
              <CardDescription>Haz clic en una barra para ver su distribución por franja.</CardDescription>
            </CardHeader>
            <CardContent>
              <RankingBarras datos={ranking} seleccionado={elegido?.codigo} alSeleccionar={setSeleccionado} />
            </CardContent>
          </Card>
          {elegido && (
            <Card className="lg:col-span-2 lg:self-start">
              <CardHeader>
                <CardTitle className="text-base">
                  <span className="font-mono">{elegido.codigo}</span> · {elegido.nombre}
                </CardTitle>
                <CardDescription>
                  {elegido.total} voto{elegido.total === 1 ? '' : 's'}. Un voto con 2 franjas suma 1 en cada una.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DistribucionFranjas franjas={elegido.franjas} />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
