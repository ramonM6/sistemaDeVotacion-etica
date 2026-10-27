import { useQuery } from '@tanstack/react-query';
import { Info, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cargando, ErrorCarga, Titulo, Vacio } from '@/components/Estados';
import { AptitudBadge, FranjasTexto } from '@/components/Insignias';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { api } from '@/lib/api';
import { formatearCreditos, textoCreditos } from '@/lib/formato';
import type { ElectivoAlumno } from '@/lib/tipos';
import { cn } from '@/lib/utils';
import { useEstadoAlumno, useVotacionAlumno } from './LayoutAlumno';

type Filtro = 'todos' | 'aptos' | 'votados';

export function EtiquetaPropia({ estado }: { estado: ElectivoAlumno['estadoPropio'] }) {
  if (estado === 'APROBADO') return <Badge variant="info">Ya aprobaste este curso</Badge>;
  if (estado === 'EN_CURSO') return <Badge variant="info">Lo estás llevando</Badge>;
  return null;
}

/** Lista de lo que falta para un electivo NO_APTO (tooltip). */
const faltantes = (e: ElectivoAlumno) => e.elegibilidad.requisitos.filter((r) => !r.cumple).map((r) => r.detalle);

export default function Catalogo() {
  const { procesoId, rutaProceso } = useVotacionAlumno();
  const estado = useEstadoAlumno();
  const consulta = useQuery({ queryKey: ['alumno', procesoId, 'electivos'], queryFn: () => api.electivos(procesoId) });
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');

  const electivos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (consulta.data?.electivos ?? [])
      .filter((e) => !q || e.codigo.toLowerCase().includes(q) || e.nombre.toLowerCase().includes(q))
      .filter((e) =>
        filtro === 'aptos' ? e.elegibilidad.aptitud !== 'NO_APTO' : filtro === 'votados' ? !!e.voto : true,
      )
      .sort((a, b) => {
        const orden = { CONFIRMADO: 0, CONDICIONAL: 1, NO_APTO: 2 };
        return orden[a.elegibilidad.aptitud] - orden[b.elegibilidad.aptitud] || a.codigo.localeCompare(b.codigo);
      });
  }, [consulta.data, busqueda, filtro]);

  if (consulta.isLoading || estado.isLoading) return <Cargando />;
  if (consulta.error) return <ErrorCarga error={consulta.error} />;

  const e = estado.data;
  const sinVotos = !!e && e.votosUsados >= e.maxCursos;
  const todos = consulta.data!.electivos;
  const conteo = {
    todos: todos.length,
    aptos: todos.filter((x) => x.elegibilidad.aptitud !== 'NO_APTO').length,
    votados: todos.filter((x) => x.voto).length,
  };

  return (
    <div>
      <Titulo
        titulo="Catálogo de electivos"
        descripcion={
          <>
            Tus créditos: {formatearCreditos(consulta.data!.creditos.aprobados)} aprobados ·{' '}
            {formatearCreditos(consulta.data!.creditos.enCurso)} en curso
            {e && ` · Votos usados: ${e.votosUsados} de ${e.maxCursos}`}
          </>
        }
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            className="pl-9"
            placeholder="Buscar por código o nombre"
            value={busqueda}
            onChange={(ev) => setBusqueda(ev.target.value)}
            aria-label="Buscar electivo"
          />
        </div>
        <div className="inline-flex rounded-md border bg-background p-1" role="group" aria-label="Filtro">
          {(['todos', 'aptos', 'votados'] as Filtro[]).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              aria-pressed={filtro === f}
              className={cn(
                'rounded px-3 py-1.5 text-sm font-medium capitalize text-muted-foreground transition-colors',
                filtro === f && 'bg-primary text-primary-foreground',
              )}
            >
              {f} ({conteo[f]})
            </button>
          ))}
        </div>
      </div>

      {sinVotos && (
        <p className="mb-4 rounded-md border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-900">
          Ya usaste tus {e!.maxCursos} votos. Los botones de votar están deshabilitados.
        </p>
      )}

      {electivos.length === 0 ? (
        <Vacio>No hay electivos que coincidan con tu búsqueda.</Vacio>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {electivos.map((el) => {
            const noApto = el.elegibilidad.aptitud === 'NO_APTO';
            const puedeVotar = !!e?.puedeVotar && !noApto && !el.voto && !sinVotos;
            return (
              <Card
                key={el.codigo}
                className={cn('flex flex-col', noApto && 'bg-slate-50 text-muted-foreground opacity-80')}
              >
                <CardHeader className="space-y-2 pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-mono text-xs font-semibold">{el.codigo}</span>
                    <span className="text-xs">{textoCreditos(el.creditos)}</span>
                  </div>
                  <CardTitle className={cn('text-base leading-snug', noApto && 'text-slate-500')}>
                    {el.nombre}
                  </CardTitle>
                  <div className="flex flex-wrap gap-1.5">
                    <AptitudBadge elegibilidad={el.elegibilidad} />
                    {el.voto && <Badge>Votado</Badge>}
                    <EtiquetaPropia estado={el.estadoPropio} />
                  </div>
                </CardHeader>
                <CardContent className="flex-1 pb-3">
                  <p className="line-clamp-3 text-sm text-muted-foreground">
                    {el.descripcion || <span className="italic">Sin descripción.</span>}
                  </p>
                  {el.voto && (
                    <div className="mt-3 text-xs">
                      Tus franjas: <FranjasTexto franjas={el.voto.franjas} />
                    </div>
                  )}
                </CardContent>
                <CardFooter className="gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link to={`${rutaProceso}/catalogo/${el.codigo}`}>Ver detalle</Link>
                  </Button>
                  {noApto ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span tabIndex={0} className="inline-flex items-center gap-1">
                          <Button size="sm" disabled>
                            Votar
                          </Button>
                          <Info className="h-4 w-4" aria-label="Por qué no puedes votar" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="mb-1 font-semibold">Te falta:</p>
                        <ul className="list-disc space-y-0.5 pl-4">
                          {faltantes(el).map((f) => (
                            <li key={f}>{f}</li>
                          ))}
                        </ul>
                      </TooltipContent>
                    </Tooltip>
                  ) : !el.voto ? (
                    puedeVotar ? (
                      <Button asChild size="sm">
                        <Link to={`${rutaProceso}/catalogo/${el.codigo}`}>Votar</Link>
                      </Button>
                    ) : (
                      <Button size="sm" disabled>
                        Votar
                      </Button>
                    )
                  ) : null}
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
