import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Info, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cargando, ErrorCarga, Titulo, Vacio } from '@/components/Estados';
import { AptitudBadge, FranjasTexto } from '@/components/Insignias';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { api } from '@/lib/api';
import { formatearCreditos, textoCreditos } from '@/lib/formato';
import type { ElectivoAlumno } from '@/lib/tipos';
import { cn } from '@/lib/utils';
import { useEstadoAlumno, useVotacionAlumno } from './LayoutAlumno';

type Filtro = 'todos' | 'aptos' | 'votados' | 'interesados';

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
  const cliente = useQueryClient();
  const intereses = useQuery({
    queryKey: ['alumno', procesoId, 'intereses'],
    queryFn: () => api.interesesAlumno(procesoId!),
  });
  const [marcados, setMarcados] = useState<string[]>([]);
  const marcar = useMutation({
    mutationFn: async ({ codigos, interesado }: { codigos: string[]; interesado: boolean }) => {
      for (const codigo of codigos) await api.marcarInteres(procesoId!, codigo, interesado);
    },
    onSuccess: () => {
      setMarcados([]);
      toast.success('Cursos de interés actualizados');
    },
    onError: () => toast.error('No se pudieron guardar todos los cambios. Revisa los intereses y vuelve a intentarlo.'),
    onSettled: () => cliente.invalidateQueries({ queryKey: ['alumno', procesoId, 'intereses'] }),
  });
  const consulta = useQuery({ queryKey: ['alumno', procesoId, 'electivos'], queryFn: () => api.electivos(procesoId) });
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');

  const electivos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (consulta.data?.electivos ?? [])
      .filter((e) => !q || e.codigo.toLowerCase().includes(q) || e.nombre.toLowerCase().includes(q))
      .filter((e) =>
        filtro === 'aptos'
          ? e.elegibilidad.aptitud !== 'NO_APTO'
          : filtro === 'votados'
            ? !!e.voto
            : filtro === 'interesados'
              ? !!intereses.data?.includes(e.codigo)
              : true,
      )
      .sort((a, b) => {
        const orden = { CONFIRMADO: 0, CONDICIONAL: 1, NO_APTO: 2 };
        return orden[a.elegibilidad.aptitud] - orden[b.elegibilidad.aptitud] || a.codigo.localeCompare(b.codigo);
      });
  }, [consulta.data, busqueda, filtro, intereses.data]);

  if (consulta.isLoading || estado.isLoading) return <Cargando />;
  if (consulta.error) return <ErrorCarga error={consulta.error} />;

  const seleccionados = marcados.filter((codigo) => electivos.some((c) => c.codigo === codigo));
  const todosMarcados = electivos.length > 0 && seleccionados.length === electivos.length;
  const bloqueado = intereses.isLoading || !!intereses.error || marcar.isPending;
  const e = estado.data;
  const sinVotos = !!e && e.votosUsados >= e.maxCursos;
  const todos = consulta.data!.electivos;
  const conteo = {
    interesados: todos.filter((x) => intereses.data?.includes(x.codigo)).length,
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

      <p className="mb-4 text-sm text-muted-foreground">
        Selecciona cursos por fila y guarda los marcados como cursos de interés. Esto no registra votos.
      </p>
      {intereses.error && <p className="mb-4 text-sm text-destructive">No se pudieron cargar tus cursos de interés.</p>}
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
        <div className="inline-flex flex-wrap rounded-md border bg-background p-1" role="group" aria-label="Filtro">
          {(['todos', 'aptos', 'votados', 'interesados'] as Filtro[]).map((f) => (
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
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
            <p className="mr-auto text-sm font-medium" aria-live="polite">
              {seleccionados.length} de {electivos.length} cursos marcados
            </p>
            <Button
              disabled={bloqueado || !seleccionados.length}
              onClick={() => marcar.mutate({ codigos: seleccionados, interesado: true })}
            >
              {marcar.isPending ? 'Guardando…' : 'Guardar como interesados'}
            </Button>
            <Button
              variant="outline"
              disabled={bloqueado || !seleccionados.length}
              onClick={() => marcar.mutate({ codigos: seleccionados, interesado: false })}
            >
              Quitar de interesados
            </Button>
          </div>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-left">
              <thead className="bg-muted/50 text-sm text-muted-foreground">
                <tr>
                  <th className="w-12 px-4 py-3">
                    <Checkbox
                      aria-label="Marcar todos los cursos visibles"
                      checked={todosMarcados ? true : seleccionados.length ? 'indeterminate' : false}
                      disabled={bloqueado}
                      onCheckedChange={(v) => setMarcados(v === true ? electivos.map((c) => c.codigo) : [])}
                    />
                  </th>
                  <th className="px-4 py-3">Electivo</th>
                  <th className="px-4 py-3">Créditos</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {electivos.map((el) => {
                  const noApto = el.elegibilidad.aptitud === 'NO_APTO';
                  const puedeVotar = !!e?.puedeVotar && !noApto && !el.voto && !sinVotos;
                  return (
                    <tr
                      key={el.codigo}
                      className={cn('border-t', seleccionados.includes(el.codigo) && 'bg-blue-50/60')}
                    >
                      <td className="px-4 py-4">
                        <Checkbox
                          aria-label={`Marcar ${el.codigo}`}
                          checked={seleccionados.includes(el.codigo)}
                          disabled={bloqueado}
                          onCheckedChange={(v) =>
                            setMarcados((actual) =>
                              v === true ? [...new Set([...actual, el.codigo])] : actual.filter((c) => c !== el.codigo),
                            )
                          }
                        />
                      </td>
                      <td className="min-w-[220px] px-4 py-4">
                        <span className="font-mono text-xs font-semibold">{el.codigo}</span>
                        <p className="mt-1 text-sm font-medium">{el.nombre}</p>
                        {el.voto && (
                          <div className="mt-2 text-xs">
                            Tus franjas: <FranjasTexto franjas={el.voto.franjas} />
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm">{textoCreditos(el.creditos)}</td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          <AptitudBadge elegibilidad={el.elegibilidad} />
                          {el.voto && <Badge>Votado</Badge>}
                          <EtiquetaPropia estado={el.estadoPropio} />
                          {intereses.data?.includes(el.codigo) && <Badge variant="info">Me interesa</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
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
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
