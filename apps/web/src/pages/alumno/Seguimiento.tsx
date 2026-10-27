import { useQuery } from '@tanstack/react-query';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { Cargando, ErrorCarga, Titulo, Vacio } from '@/components/Estados';
import { EstadoCursoBadge } from '@/components/EstadoCursoBadge';
import { Button } from '@/components/ui/button';
import { ETAPAS, configuracion, elegibles, type Etapa } from '@/lib/etapasCursos';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useVotacionAlumno } from './LayoutAlumno';
export default function Seguimiento() {
  const { procesoId, rutaProceso } = useVotacionAlumno();
  const { etapa = 'seleccion' } = useParams();
  const consulta = useQuery({
    queryKey: ['alumno', procesoId, 'seguimiento'],
    queryFn: () => api.seguimientoAlumno(procesoId!),
    refetchInterval: 30_000,
  });
  const resultados = useQuery({
    queryKey: ['alumno', procesoId, 'resultados'],
    queryFn: () => api.resultadosPublicos(procesoId),
    refetchInterval: 30_000,
  });
  if (!ETAPAS.includes(etapa as Etapa)) return <Navigate to={`${rutaProceso}/seguimiento/seleccion`} replace />;
  if (consulta.isLoading || resultados.isLoading) return <Cargando />;
  if (consulta.error || resultados.error) return <ErrorCarga error={consulta.error || resultados.error} />;
  const { proceso, cursos } = consulta.data!;
  if (proceso.estado !== 'CERRADO')
    return (
      <>
        <Titulo titulo="Seguimiento de cursos" />
        <Vacio>El seguimiento estará disponible al cierre de la votación.</Vacio>
      </>
    );
  const actual = etapa as Etapa;
  const config = configuracion[actual];
  const indice = ETAPAS.indexOf(actual);
  const votos = new Map(resultados.data!.ranking.map((c) => [c.codigo, c.total]));
  const filas = elegibles(cursos, actual).sort(
    (a, b) => (votos.get(b.codigo) ?? 0) - (votos.get(a.codigo) ?? 0) || a.codigo.localeCompare(b.codigo),
  );
  return (
    <div>
      <Titulo
        titulo="Seguimiento de cursos"
        descripcion="Consulta las decisiones de la coordinación por etapas. Vista de solo lectura."
      />
      <div className="space-y-7">
        <nav aria-label="Etapas de decisión de cursos">
          <ol className="grid gap-3 sm:grid-cols-3">
            {ETAPAS.map((paso, i) => {
              const participantes = elegibles(cursos, paso);
              const resueltos = participantes.filter((c) => c[configuracion[paso].campo] !== 'PENDIENTE').length;
              const completo = participantes.length > 0 && resueltos === participantes.length;
              return (
                <li key={paso}>
                  <Link
                    to={`${rutaProceso}/seguimiento/${paso}`}
                    aria-current={paso === actual ? 'step' : undefined}
                    className={cn(
                      'flex h-full items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/50',
                      paso === actual && 'border-primary bg-blue-50/50',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 font-semibold',
                        paso === actual
                          ? 'border-primary bg-primary text-white'
                          : completo
                            ? 'border-emerald-600 text-emerald-700'
                            : 'text-muted-foreground',
                      )}
                    >
                      {completo ? <Check className="h-5 w-5" /> : i + 1}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">{configuracion[paso].titulo}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {resueltos} de {participantes.length} decididos
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">{config.titulo}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{config.descripcion}</p>
          </div>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-left">
              <thead className="bg-muted/50 text-sm text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Electivo</th>
                  <th className="px-4 py-3 text-center">Votos</th>
                  <th className="px-4 py-3">Estado en esta etapa</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((c) => (
                  <tr key={c.codigo} className="border-t">
                    <td className="px-4 py-4">
                      <span className="font-mono text-xs font-semibold">{c.codigo}</span>
                      <p className="mt-1 text-sm">{c.nombre}</p>
                    </td>
                    <td className="px-4 py-4 text-center font-semibold">{votos.get(c.codigo) ?? 0}</td>
                    <td className="px-4 py-4">
                      <EstadoCursoBadge
                        estado={c[config.campo]}
                        texto={
                          c[config.campo] === 'PENDIENTE' && actual === 'seleccion'
                            ? 'Pendiente de selección'
                            : undefined
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!filas.length && (
              <p className="p-6 text-sm text-muted-foreground">
                {actual === 'seleccion'
                  ? 'No hay electivos en esta votación.'
                  : actual === 'consejo'
                    ? 'Todavía no hay cursos seleccionados para revisión.'
                    : 'Todavía no hay cursos aprobados por el consejo.'}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap justify-between gap-3">
          {indice > 0 ? (
            <Button asChild variant="outline">
              <Link to={`${rutaProceso}/seguimiento/${ETAPAS[indice - 1]}`}>
                <ArrowLeft /> Etapa anterior
              </Link>
            </Button>
          ) : (
            <span />
          )}
          {indice < ETAPAS.length - 1 && (
            <Button asChild>
              <Link to={`${rutaProceso}/seguimiento/${ETAPAS[indice + 1]}`}>
                Siguiente etapa <ArrowRight />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
