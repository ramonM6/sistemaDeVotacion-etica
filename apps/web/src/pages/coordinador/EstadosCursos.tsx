import { confirmar } from '@/components/Confirmacion';
import { ETAPAS, configuracion, elegibles, type Etapa } from '@/lib/etapasCursos';
export { ETAPAS, type Etapa } from '@/lib/etapasCursos';
import { EstadoCursoBadge } from '@/components/EstadoCursoBadge';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, MoreVertical, ChevronLeft } from 'lucide-react';
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

function MenuCurso({
  codigo,
  detalle,
  ocupado,
  cambiar,
}: {
  codigo: string;
  detalle: string;
  ocupado: boolean;
  cambiar?: (estado: string) => void;
}) {
  const [menu, setMenu] = useState<{ top: number; right: number } | null>(null);
  const [submenu, setSubmenu] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const opciones = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    opciones.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const cerrar = (ev: PointerEvent) => {
      if (!opciones.current?.contains(ev.target as Node) && !boton.current?.contains(ev.target as Node)) setMenu(null);
    };
    const desplazar = () => setMenu(null);
    document.addEventListener('pointerdown', cerrar);
    window.addEventListener('scroll', desplazar, true);
    window.addEventListener('resize', desplazar);
    return () => {
      document.removeEventListener('pointerdown', cerrar);
      window.removeEventListener('scroll', desplazar, true);
      window.removeEventListener('resize', desplazar);
    };
  }, [menu]);
  return (
    <div className="flex justify-end">
      <Button
        ref={boton}
        variant="ghost"
        size="icon"
        aria-label={`Opciones de ${codigo}`}
        aria-haspopup="menu"
        aria-expanded={!!menu}

        onClick={() => {
          const rect = boton.current!.getBoundingClientRect();
          setSubmenu(false);
          setMenu(
            menu
              ? null
              : {
                  top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 160)),
                  right: Math.max(8, window.innerWidth - rect.right),
                },
          );
        }}
      >
        <MoreVertical aria-hidden className="h-5 w-5" />
      </Button>
      {menu &&
        createPortal(
          <div
            ref={opciones}
            role="menu"
            aria-label={`Acciones de ${codigo}`}
            style={menu}
            className="fixed z-50 w-64 rounded-md border bg-card p-1 shadow-lg"
            onKeyDown={(ev) => {
              if (ev.key === 'Escape') {
                setMenu(null);
                boton.current?.focus();
              }
              if (ev.key === 'Tab') setMenu(null);
              if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
                ev.preventDefault();
                const items = Array.from(opciones.current!.querySelectorAll<HTMLElement>('[role="menuitem"]'));
                const i = items.indexOf(document.activeElement as HTMLElement);
                items[(i + (ev.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
              }
            }}
          >
            <Link
              role="menuitem"
              to={detalle}
              onClick={() => setMenu(null)}
              className="block rounded px-3 py-2 text-sm hover:bg-accent focus:bg-accent focus:outline-none"
            >
              Ver detalle
            </Link>
            {cambiar && (
              <div className="relative" onMouseEnter={() => setSubmenu(true)} onMouseLeave={() => setSubmenu(false)}>
                <button
                  role="menuitem"
                  aria-haspopup="menu"
                  aria-expanded={submenu}
                  disabled={ocupado}
                  className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none disabled:opacity-50"
                  onClick={() => setSubmenu((v) => !v)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'ArrowLeft') {
                      ev.preventDefault();
                      ev.stopPropagation();
                      setSubmenu(true);
                      requestAnimationFrame(() =>
                        opciones.current
                          ?.querySelector<HTMLElement>('[aria-label="Estado de selección"] [role="menuitem"]')
                          ?.focus(),
                      );
                    }
                  }}
                >
                  <ChevronLeft aria-hidden className="h-4 w-4" /> Cambiar estado
                </button>
                {submenu && (
                  <div
                    role="menu"
                    aria-label="Estado de selección"
                    className="absolute right-full top-0 w-52 rounded-md border bg-card p-1 shadow-lg"
                    onKeyDown={(ev) => {
                      if (ev.key === 'ArrowRight') {
                        ev.preventDefault();
                        ev.stopPropagation();
                        setSubmenu(false);
                        opciones.current?.querySelector<HTMLElement>('[aria-haspopup="menu"]')?.focus();
                      }
                    }}
                  >
                    {['PENDIENTE', 'SELECCIONADO_PARA_REVISION', 'NO_SELECCIONADO'].map((estado) => (
                      <button
                        key={estado}
                        role="menuitem"
                        disabled={ocupado}
                        className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none disabled:opacity-50"
                        onClick={() => {
                          setMenu(null);
                          setSubmenu(false);
                          boton.current?.focus();
                          cambiar(estado);
                        }}
                      >
                        {estado === 'SELECCIONADO_PARA_REVISION' ? 'Seleccionado' : etiquetas[estado]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

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
  const { rutaProceso } = useProcesoSeleccionado();
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
  const estadoResto = { seleccion: 'NO_SELECCIONADO', consejo: 'NO_APROBADO', dictado: 'NO_SE_DICTARA' }[etapa];
  const resto = filas.filter((c) => !seleccionados.includes(c.codigo) && c[config.campo] !== estadoResto);
  const descartarResto = useMutation({
    mutationFn: () =>
      api.decidirCursos(
        proceso.id,
        etapa,
        estadoResto,
        resto.map((c) => c.codigo),
      ),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['coord'] });
      toast.success(`El resto quedó como ${etiquetas[estadoResto]}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const individual = useMutation({
    mutationFn: ({ codigo, estado }: { codigo: string; estado: string }) =>
      api.decidirCursos(proceso.id, 'seleccion', estado, [codigo]),
    onSuccess: async () => {
      await cliente.invalidateQueries({ queryKey: ['coord'] });
      toast.success('Selección actualizada');
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const bloqueado = !cerrado || guardar.isPending || descartarResto.isPending || individual.isPending;
  const aplicar = async () => {
    const reinicia =
      etapa === 'seleccion'
        ? seleccionados.some((codigo) =>
            cursos.some((c) => c.codigo === codigo && (c.consejo !== 'PENDIENTE' || c.dictado !== 'PENDIENTE')),
          )
        : etapa === 'consejo' &&
          seleccionados.some((codigo) => cursos.some((c) => c.codigo === codigo && c.dictado !== 'PENDIENTE'));
    if (
      !reinicia ||
      (await confirmar('Cambiar esta decisión borrará los estados posteriores de los cursos marcados. ¿Continuar?'))
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
          {
            <Button
              variant="outline"
              disabled={bloqueado || !seleccionados.length || !resto.length}
              onClick={async () => {
                const reinicia = resto.some((c) =>
                  etapa === 'seleccion'
                    ? c.consejo !== 'PENDIENTE' || c.dictado !== 'PENDIENTE'
                    : etapa === 'consejo' && c.dictado !== 'PENDIENTE',
                );
                if (
                  await confirmar(
                    `Se dejarán ${resto.length} cursos sin marcar como «${etiquetas[estadoResto]}». Los ${seleccionados.length} marcados conservarán su estado.${reinicia ? ' Se borrarán las decisiones posteriores de los cursos descartados.' : ''}`,
                  )
                )
                  descartarResto.mutate();
              }}
            >
              Resto como {etiquetas[estadoResto].toLowerCase()} ({resto.length})
            </Button>
          }
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
              {etapa === 'seleccion' && (
                <th className="w-14">
                  <span className="sr-only">Opciones del curso</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {filas.map((c) => (
              <tr
                key={c.codigo}
                aria-selected={seleccionados.includes(c.codigo)}
                className={cn('border-t', seleccionados.includes(c.codigo) && 'bg-blue-50/60')}
              >
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
                {etapa === 'seleccion' && (
                  <td className="px-4 py-4">
                    <MenuCurso
                      codigo={c.codigo}
                      detalle={`${rutaProceso}/resultados/${c.codigo}`}
                      ocupado={bloqueado}
                      cambiar={
                        cerrado
                          ? async (estado) => {
                              if (bloqueado) return;
                              if (c.consejo !== 'PENDIENTE' || c.dictado !== 'PENDIENTE') {
                                if (
                                  !(await confirmar(
                                    'Cambiar esta selección borrará las decisiones posteriores de este curso. ¿Continuar?',
                                  ))
                                )
                                  return;
                              }
                              individual.mutate({ codigo: c.codigo, estado });
                            }
                          : undefined
                      }
                    />
                  </td>
                )}
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
