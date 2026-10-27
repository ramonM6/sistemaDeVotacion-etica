import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Cargando, ErrorCarga } from '@/components/Estados';
import { DistribucionFranjas } from '@/components/Graficos';
import { EnVivo } from '@/components/Insignias';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { textoCreditos } from '@/lib/formato';
import { useResultadosEnVivo } from '@/lib/socket';
import { useProcesoSeleccionado } from './LayoutCoord';

export default function DetalleCurso() {
  const { codigo = '' } = useParams();
  const { procesoId, rutaProceso } = useProcesoSeleccionado();
  const consulta = useQuery({
    queryKey: ['coord', 'resultados', 'curso', codigo, procesoId],
    queryFn: () => api.detalleCurso(codigo, procesoId),
  });
  const conectado = useResultadosEnVivo([['coord', 'resultados']]);

  if (consulta.isLoading) return <Cargando />;
  if (consulta.error) return <ErrorCarga error={consulta.error} />;
  const d = consulta.data!;

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-3">
        <Link to={`${rutaProceso}/resultados`}>
          <ArrowLeft /> Volver a resultados
        </Link>
      </Button>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-sm text-muted-foreground">
            {d.curso.codigo} · {textoCreditos(d.curso.creditos)} · {d.curso.requisitosTexto || 'sin requisitos'}
          </p>
          <h1 className="text-2xl font-bold tracking-tight">{d.curso.nombre}</h1>
        </div>
        <div className="flex items-center gap-3">
          <EnVivo conectado={conectado} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ['Votos', d.total],
          ['Confirmados', d.confirmados],
          ['Condicionales', d.condicionales],
        ].map(([t, v]) => (
          <Card key={t}>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{t}</p>
              <p className="mt-1 text-3xl font-bold tabular-nums">{v}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2 lg:self-start">
          <CardHeader>
            <CardTitle className="text-base">Distribución por franja</CardTitle>
          </CardHeader>
          <CardContent>
            <DistribucionFranjas franjas={d.franjas} />
          </CardContent>
        </Card>
        <Card className="p-5 lg:col-span-3">
          <p className="text-sm text-muted-foreground">
            Las elecciones individuales son privadas. Consulta los resultados agregados por curso y franja.
          </p>
        </Card>
      </div>
    </div>
  );
}
