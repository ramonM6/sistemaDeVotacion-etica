import { confirmar } from '@/components/Confirmacion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MoreVertical, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { Cargando, ErrorCarga, Titulo, Vacio } from '@/components/Estados';
import { AptitudBadge, FranjasTexto } from '@/components/Insignias';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { FRANJAS, formatearCreditos, textoCreditos } from '@/lib/formato';
import type { ElectivoAlumno, Franja } from '@/lib/tipos';
import { cn } from '@/lib/utils';
import { useEstadoAlumno, useVotacionAlumno } from './LayoutAlumno';

type Filtro = 'todos' | 'aptos' | 'condicionales' | 'no aptos' | 'votados' | 'no votados';
export function EtiquetaPropia({ estado }: { estado: ElectivoAlumno['estadoPropio'] }) {
  if (estado === 'APROBADO') return <Badge variant="info">Ya aprobaste este curso</Badge>;
  if (estado === 'EN_CURSO') return <Badge variant="info">Lo estás llevando</Badge>;
  return null;
}

function AccionesCurso({
  curso,
  detalle,
  alRetirar,
  ocupado,
}: {
  curso: ElectivoAlumno;
  detalle: string;
  alRetirar?: () => void;
  ocupado: boolean;
}) {
  const [menu, setMenu] = useState<{ top: number; right: number } | null>(null);
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
        aria-label={`Opciones de ${curso.codigo}`}
        aria-haspopup="menu"
        aria-expanded={!!menu}
        disabled={ocupado}
        onClick={() => {
          const rect = boton.current!.getBoundingClientRect();
          setMenu(
            menu
              ? null
              : {
                  top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 110)),
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
            aria-label={`Acciones de ${curso.codigo}`}
            style={menu}
            className="fixed z-50 w-44 rounded-md border bg-card p-1 shadow-lg"
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
            {alRetirar && (
              <button
                role="menuitem"
                className="w-full rounded px-3 py-2 text-left text-sm text-destructive hover:bg-accent focus:bg-accent focus:outline-none"
                onClick={() => {
                  setMenu(null);
                  boton.current?.focus();
                  alRetirar();
                }}
              >
                Retirar voto
              </button>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

export default function Catalogo() {
  const { procesoId, rutaProceso } = useVotacionAlumno();
  const estado = useEstadoAlumno();
  const cliente = useQueryClient();
  const consulta = useQuery({ queryKey: ['alumno', procesoId, 'electivos'], queryFn: () => api.electivos(procesoId) });
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [marcados, setMarcados] = useState<string[]>([]);
  const [confirmando, setConfirmando] = useState(false);
  const [franjas, setFranjas] = useState<Record<string, Franja[]>>({});
  const electivos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (consulta.data?.electivos ?? [])
      .filter((c) => !q || c.codigo.toLowerCase().includes(q) || c.nombre.toLowerCase().includes(q))
      .filter((c) =>
        filtro === 'aptos'
          ? c.elegibilidad.aptitud === 'CONFIRMADO'
          : filtro === 'condicionales'
            ? c.elegibilidad.aptitud === 'CONDICIONAL'
            : filtro === 'no aptos'
              ? c.elegibilidad.aptitud === 'NO_APTO'
              : filtro === 'votados'
                ? !!c.voto
                : filtro === 'no votados'
                  ? !c.voto
                  : true,
      )
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, [consulta.data, busqueda, filtro]);
  const seleccionados = electivos.filter(
    (c) => marcados.includes(c.codigo) && !c.voto && c.elegibilidad.aptitud !== 'NO_APTO',
  );
  const retirar = useMutation({
    mutationFn: (codigo: string) => api.retirarVoto(codigo, procesoId),
    onSuccess: () => {
      setMarcados([]);
      toast.success('Voto retirado');
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => cliente.invalidateQueries({ queryKey: ['alumno'] }),
  });
  const votar = useMutation({
    mutationFn: () =>
      api.votarLote(
        procesoId!,
        seleccionados.map((c) => ({ cursoCodigo: c.codigo, franjas: franjas[c.codigo] ?? [] })),
      ),
    onSuccess: () => {
      setConfirmando(false);
      setMarcados([]);
      setFranjas({});
      toast.success('Votos registrados');
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => cliente.invalidateQueries({ queryKey: ['alumno'] }),
  });
  if (consulta.isLoading || estado.isLoading) return <Cargando />;
  if (consulta.error) return <ErrorCarga error={consulta.error} />;
  const e = estado.data!;
  const disponibles = electivos.filter((c) => !c.voto && c.elegibilidad.aptitud !== 'NO_APTO');
  const todosMarcados = disponibles.length > 0 && seleccionados.length === disponibles.length;
  const restantes = e.maxCursos - e.votosUsados;
  const q = busqueda.trim().toLowerCase();
  const todos = consulta.data!.electivos.filter(
    (c) => !q || c.codigo.toLowerCase().includes(q) || c.nombre.toLowerCase().includes(q),
  );
  const conteo = {
    todos: todos.length,
    aptos: todos.filter((c) => c.elegibilidad.aptitud === 'CONFIRMADO').length,
    condicionales: todos.filter((c) => c.elegibilidad.aptitud === 'CONDICIONAL').length,
    'no aptos': todos.filter((c) => c.elegibilidad.aptitud === 'NO_APTO').length,
    votados: todos.filter((c) => c.voto).length,
    'no votados': todos.filter((c) => !c.voto).length,
  };
  const puedeSeleccionar = e.abierto && restantes > 0 && !votar.isPending;
  return (
    <div>
      <Titulo
        titulo="Cursos electivos"
        descripcion={
          <>
            Tus créditos: {formatearCreditos(consulta.data!.creditos.aprobados)} aprobados ·{' '}
            {formatearCreditos(consulta.data!.creditos.enCurso)} en curso · Votos usados: {e.votosUsados} de{' '}
            {e.maxCursos}
          </>
        }
      />
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search aria-hidden className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por código o nombre"
            aria-label="Buscar electivo"
            value={busqueda}
            onChange={(ev) => setBusqueda(ev.target.value)}
          />
        </div>
        <div className="inline-flex flex-wrap rounded-md border bg-background p-1" role="group" aria-label="Filtro">
          {(['todos', 'aptos', 'condicionales', 'no aptos', 'votados', 'no votados'] as Filtro[]).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              aria-pressed={filtro === f}
              className={cn(
                'rounded px-3 py-1.5 text-sm font-medium capitalize text-muted-foreground',
                filtro === f && 'bg-primary text-primary-foreground',
              )}
            >
              {f} ({conteo[f]})
            </button>
          ))}
        </div>
      </div>
      {!e.abierto && (
        <p className="mb-4 text-sm text-muted-foreground">
          La votación está cerrada. Puedes consultar los detalles de los cursos.
        </p>
      )}
      {!electivos.length ? (
        <Vacio>No hay electivos que coincidan con tu búsqueda.</Vacio>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-4">
            <p className="mr-auto text-sm font-medium" aria-live="polite">
              {seleccionados.length} cursos marcados · {Math.max(0, restantes)} votos disponibles
            </p>
            <Button
              disabled={!puedeSeleccionar || !seleccionados.length || seleccionados.length > restantes}
              onClick={() => {
                setFranjas({});
                setConfirmando(true);
              }}
            >
              Votar por los seleccionados
            </Button>
            {seleccionados.length > restantes && (
              <p className="w-full text-sm text-destructive">Selecciona como máximo {restantes} cursos.</p>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-left">
              <thead className="bg-muted/50 text-sm text-muted-foreground">
                <tr>
                  <th className="w-12 px-4 py-3">
                    <Checkbox
                      aria-label="Marcar todos los cursos disponibles"
                      checked={todosMarcados ? true : seleccionados.length ? 'indeterminate' : false}
                      disabled={!puedeSeleccionar || !disponibles.length}
                      onCheckedChange={(v) => setMarcados(v === true ? disponibles.map((c) => c.codigo) : [])}
                    />
                  </th>
                  <th className="px-4 py-3">Electivo</th>
                  <th className="px-4 py-3">Créditos</th>
                  <th className="px-4 py-3">Aptitud</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="w-14 px-4 py-3">
                    <span className="sr-only">Detalle del curso</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {electivos.map((c) => {
                  const motivo = c.voto
                    ? 'Ya registraste un voto por este curso.'
                    : !e.abierto
                      ? 'La votación está cerrada.'
                      : restantes <= 0
                        ? 'Ya usaste tus votos disponibles.'
                        : c.elegibilidad.aptitud === 'NO_APTO'
                          ? 'No cumples los requisitos de este curso.'
                          : undefined;
                  return (
                    <tr
                      key={c.codigo}
                      className={cn('border-t', seleccionados.some((s) => s.codigo === c.codigo) && 'bg-blue-50/60')}
                    >
                      <td className="px-4 py-4">
                        <Checkbox
                          aria-label={`Marcar ${c.codigo}`}
                          checked={seleccionados.some((s) => s.codigo === c.codigo)}
                          disabled={!!motivo || votar.isPending}
                          onCheckedChange={(v) =>
                            setMarcados((actual) =>
                              v === true ? [...new Set([...actual, c.codigo])] : actual.filter((x) => x !== c.codigo),
                            )
                          }
                        />
                      </td>
                      <td className="min-w-[220px] px-4 py-4">
                        <span className="font-mono text-xs font-semibold">{c.codigo}</span>
                        <p className="mt-1 text-sm font-medium">{c.nombre}</p>
                        {c.voto && (
                          <div className="mt-2 text-xs">
                            Tus franjas: <FranjasTexto franjas={c.voto.franjas} />
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-sm">{textoCreditos(c.creditos)}</td>
                      <td className="px-4 py-4">
                        <AptitudBadge elegibilidad={c.elegibilidad} />
                      </td>
                      <td className="px-4 py-4">
                        {c.voto ? <Badge>Votado</Badge> : <Badge variant="outline">No votado</Badge>}
                      </td>
                      <td className="px-4 py-4">
                        <AccionesCurso
                          curso={c}
                          detalle={`${rutaProceso}/cursos/${c.codigo}`}
                          ocupado={retirar.isPending || votar.isPending}
                          alRetirar={
                            c.voto && e.abierto
                              ? async () => {
                                  if (
                                    await confirmar(
                                      `¿Retirar tu voto de ${c.nombre}? También se retirarán los electivos que dependan de este para llevarlos en simultáneo.`,
                                    )
                                  )
                                    retirar.mutate(c.codigo);
                                }
                              : undefined
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Dialog
        open={confirmando}
        onOpenChange={(v) => {
          if (!votar.isPending) setConfirmando(v);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Votar por los cursos seleccionados</DialogTitle>
            <DialogDescription>
              Elige de 1 a {e.maxFranjas} franjas por curso. Los electivos requeridos en simultáneo también cuentan
              dentro del máximo de {e.maxCursos}.
            </DialogDescription>
          </DialogHeader>
          {seleccionados.map((c) => (
            <div key={c.codigo} className="space-y-3 rounded-lg border p-4">
              <p className="text-sm font-semibold">
                {c.codigo} · {c.nombre}
              </p>
              <p
                className={cn(
                  'text-xs',
                  c.elegibilidad.aptitud === 'CONDICIONAL' ? 'text-amber-800' : 'text-emerald-700',
                )}
              >
                {c.elegibilidad.aptitud === 'CONDICIONAL' ? 'Condicional' : 'Apto'}
              </p>
              <div className="flex flex-wrap gap-3">
                {FRANJAS.map((f) => {
                  const actuales = franjas[c.codigo] ?? [];
                  const activa = actuales.includes(f.valor);
                  return (
                    <label key={f.valor} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={activa}
                        disabled={votar.isPending || (!activa && actuales.length >= e.maxFranjas)}
                        onCheckedChange={(v) =>
                          setFranjas((prev) => ({
                            ...prev,
                            [c.codigo]: v === true ? [...actuales, f.valor] : actuales.filter((x) => x !== f.valor),
                          }))
                        }
                      />
                      {f.etiqueta} ({f.horario})
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
          <DialogFooter>
            <Button variant="outline" disabled={votar.isPending} onClick={() => setConfirmando(false)}>
              Cancelar
            </Button>
            <Button
              disabled={
                !puedeSeleccionar ||
                !seleccionados.length ||
                seleccionados.length > restantes ||
                seleccionados.some((c) => !franjas[c.codigo]?.length)
              }
              onClick={() => votar.mutate()}
            >
              {votar.isPending ? 'Registrando…' : 'Confirmar votos'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
