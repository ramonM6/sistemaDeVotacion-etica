import { useVotacionAlumno } from './LayoutAlumno';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Cargando, ErrorCarga, Titulo, Vacio } from '@/components/Estados';
import { DistribucionFranjas, RankingBarras } from '@/components/Graficos';
import { EnVivo } from '@/components/Insignias';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useResultadosEnVivo } from '@/lib/socket';

/** Resultados agregados disponibles para alumnos durante la votación y después del cierre. */
export default function Resultados() {
  const { procesoId } = useVotacionAlumno();
  const consulta = useQuery({
    queryKey: ['alumno', procesoId, 'resultados'],
    queryFn: () => api.resultadosPublicos(procesoId),
    refetchInterval: 30_000,
  });
  const conectado = useResultadosEnVivo([['alumno', procesoId, 'resultados']]);
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
      {ranking.length === 0 ? (
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
