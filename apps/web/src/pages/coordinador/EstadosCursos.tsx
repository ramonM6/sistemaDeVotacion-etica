import { ETAPAS, configuracion, elegibles, type Etapa } from '@/lib/etapasCursos';
export { ETAPAS, type Etapa } from '@/lib/etapasCursos';
import { EstadoCursoBadge } from '@/components/EstadoCursoBadge';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Cargando, ErrorCarga } from '@/components/Estados';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import type { SeguimientoCurso } from '@/lib/api';
import type { Proceso } from '@/lib/tipos';
import { cn } from '@/lib/utils';
import { useProcesoSeleccionado } from './LayoutCoord';

const etiquetas: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  SELECCIONADO_PARA_REVISION: 'Seleccionado para revisión',
  NO_SELECCIONADO: 'No seleccionado',
  APROBADO: 'Aprobado',
  NO_APROBADO: 'No aprobado',
  CONFIRMADO: 'Confirmado',
  NO_SE_DICTARA: 'No se dictará',
};

function TablaEtapa({
  cursos,
  ranking,
  proceso,
  etapa,
}: {
  cursos: SeguimientoCurso[];
  ranking: { codigo: string; total: number }[];
  proceso: Proceso;
  etapa: Etapa;
}) {
  const cliente = useQueryClient();
  const [marcados, setMarcados] = useState<string[]>([]);
  const [estado, setEstado] = useState('');
  const config = configuracion[etapa];
  const filas = elegibles(cursos, etapa).sort(
    (a, b) =>
      (ranking.find((r) => r.codigo === b.codigo)?.total ?? 0) -
        (ranking.find((r) => r.codigo === a.codigo)?.total ?? 0) || a.codigo.localeCompare(b.codigo),
  );
  // Nunca aplica una selección que haya quedado fuera de la etapa tras una actualización.
  const seleccionados = marcados.filter((codigo) => filas.some((c) => c.codigo === codigo));
  const todos = filas.length > 0 && seleccionados.length === filas.length;
  const cerrado = proceso.estado === 'CERRADO';
  const guardar = useMutation({
    mutationFn: () => api.decidirCursos(proceso.id, etapa, estado, seleccionados),
    onSuccess: async () => {
      setMarcados([]);
      setEstado('');
      await cliente.invalidateQueries({ queryKey: ['coord'] });
      toast.success('Decisión aplicada a los cursos marcados');
    },
    onError: (e: Error) => {
      toast.error(e.message);
      cliente.invalidateQueries({ queryKey: ['coord'] });
    },
  });
  const bloqueado = !cerrado || guardar.isPending;
  const aplicar = () => {
    const reinicia =
      etapa === 'seleccion'
        ? seleccionados.some((codigo) =>
            cursos.some((c) => c.codigo === codigo && (c.consejo !== 'PENDIENTE' || c.dictado !== 'PENDIENTE')),
          )
        : etapa === 'consejo' &&
          seleccionados.some((codigo) => cursos.some((c) => c.codigo === codigo && c.dictado !== 'PENDIENTE'));
    if (
      !reinicia ||
      window.confirm('Cambiar esta decisión borrará los estados posteriores de los cursos marcados. ¿Continuar?')
    )
      guardar.mutate();
  };
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{config.titulo}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{config.descripcion}</p>
      </div>
      {!cerrado && (
        <p className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
          Los estados se pueden modificar cuando la votación esté cerrada.
        </p>
      )}
      {filas.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
          <p className="mr-auto text-sm font-medium" aria-live="polite">
            {seleccionados.length} de {filas.length} cursos marcados
          </p>
          <Select
            className="w-64"
            aria-label="Decisión para los cursos marcados"
            value={estado}
            disabled={bloqueado}
            onChange={(e) => setEstado(e.target.value)}
          >
            <option value="">Elegir decisión…</option>
            {config.opciones.map((o) => (
              <option key={o} value={o}>
                {etiquetas[o]}
              </option>
            ))}
          </Select>
          <Button disabled={bloqueado || !seleccionados.length || !estado} onClick={aplicar}>
            {guardar.isPending ? 'Aplicando…' : 'Aplicar a marcados'}
          </Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-left">
          <thead className="bg-muted/50 text-sm text-muted-foreground">
            <tr>
              <th className="w-12 px-4 py-3">
                <Checkbox
                  aria-label="Marcar todos los cursos de esta etapa"
                  checked={todos ? true : seleccionados.length ? 'indeterminate' : false}
                  disabled={bloqueado || !filas.length}
                  onCheckedChange={(v) => setMarcados(v === true ? filas.map((c) => c.codigo) : [])}
                />
              </th>
              <th className="px-4 py-3">Electivo</th>
              <th className="px-4 py-3 text-center">Votos</th>
              <th className="px-4 py-3">Estado en esta etapa</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((c) => (
              <tr key={c.codigo} className={cn('border-t', seleccionados.includes(c.codigo) && 'bg-blue-50/60')}>
                <td className="px-4 py-4">
                  <Checkbox
                    aria-label={`Marcar ${c.codigo}`}
                    checked={seleccionados.includes(c.codigo)}
                    disabled={bloqueado}
                    onCheckedChange={(v) =>
                      setMarcados((actual) =>
                        v === true
                          ? [...new Set([...actual, c.codigo])]
                          : actual.filter((codigo) => codigo !== c.codigo),
                      )
                    }
                  />
                </td>
                <td className="px-4 py-4">
                  <span className="font-mono text-xs font-semibold">{c.codigo}</span>
                  <p className="mt-1 text-sm">{c.nombre}</p>
                </td>
                <td className="px-4 py-4 text-center font-semibold">
                  {ranking.find((r) => r.codigo === c.codigo)?.total ?? 0}
                </td>
                <td className="px-4 py-4">
                  <EstadoCursoBadge
                    estado={c[config.campo]}
                    texto={
                      c[config.campo] === 'PENDIENTE' && etapa === 'seleccion' ? 'Pendiente de selección' : undefined
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filas.length && <p className="p-6 text-sm text-muted-foreground">{config.vacio}</p>}
      </div>
    </div>
  );
}

export default function EstadosCursos({
  ranking,
  proceso,
  etapa,
}: {
  ranking: { codigo: string; total: number }[];
  proceso: Proceso;
  etapa: Etapa;
}) {
  const { rutaProceso } = useProcesoSeleccionado();
  const consulta = useQuery({
    queryKey: ['coord', 'seguimiento', proceso.id],
    queryFn: () => api.seguimiento(proceso.id),
  });
  if (consulta.isLoading) return <Cargando />;
  if (consulta.error) return <ErrorCarga error={consulta.error} />;
  const cursos = consulta.data!.cursos;
  const indice = ETAPAS.indexOf(etapa);
  return (
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
                  to={`${rutaProceso}/cursos/${paso}`}
                  aria-current={paso === etapa ? 'step' : undefined}
                  className={cn(
                    'flex h-full items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/50',
                    paso === etapa && 'border-primary bg-blue-50/50',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 font-semibold',
                      paso === etapa
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
      <TablaEtapa key={`${proceso.id}-${etapa}`} cursos={cursos} ranking={ranking} proceso={proceso} etapa={etapa} />
      <div className="flex flex-wrap justify-between gap-3">
        {indice > 0 ? (
          <Button asChild variant="outline">
            <Link to={`${rutaProceso}/cursos/${ETAPAS[indice - 1]}`}>
              <ArrowLeft /> Etapa anterior
            </Link>
          </Button>
        ) : (
          <span />
        )}
        {indice < ETAPAS.length - 1 && (
          <Button asChild>
            <Link to={`${rutaProceso}/cursos/${ETAPAS[indice + 1]}`}>
              Siguiente etapa <ArrowRight />
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
