import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { FRANJAS } from '@/lib/formato';
import type { MiVoto, Franja } from '@/lib/tipos';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Cargando, ErrorCarga, Titulo, Vacio } from '@/components/Estados';
import { AptitudSnapshot, FranjasTexto } from '@/components/Insignias';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatearCreditos, formatearFecha } from '@/lib/formato';
import { useEstadoAlumno, useVotacionAlumno } from './LayoutAlumno';

function EditarVoto({ voto, maxFranjas }: { voto: MiVoto; maxFranjas: number }) {
  const { procesoId } = useVotacionAlumno();
  const cliente = useQueryClient();
  const [editando, setEditando] = useState(false);
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
  const [franjas, setFranjas] = useState<Franja[]>(voto.franjas);
  const cambio = useMutation({
    mutationFn: (retirar: boolean) =>
      retirar ? api.retirarVoto(voto.cursoCodigo, procesoId) : api.editarVoto(voto.cursoCodigo, franjas, procesoId),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['alumno'] });
      setEditando(false);
      toast.success('Elección actualizada');
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-2">
      <Dialog
        open={editando}
        onOpenChange={(abierto) => {
          if (!cambio.isPending) setEditando(abierto);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar franjas</DialogTitle>
            <DialogDescription>
              {voto.cursoCodigo} · {voto.cursoNombre}. Selecciona de 1 a {maxFranjas} franjas.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            {FRANJAS.map((f) => (
              <label key={f.valor} className="flex items-center gap-3 rounded-md border p-3 text-sm">
                <input
                  type="checkbox"
                  checked={franjas.includes(f.valor)}
                  disabled={cambio.isPending || (!franjas.includes(f.valor) && franjas.length >= maxFranjas)}
                  onChange={() =>
                    setFranjas((a) => (a.includes(f.valor) ? a.filter((x) => x !== f.valor) : [...a, f.valor]))
                  }
                />
                <span>
                  {f.etiqueta} <span className="text-muted-foreground">{f.horario}</span>
                </span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={cambio.isPending} onClick={() => setEditando(false)}>
              Cancelar
            </Button>
            <Button disabled={!franjas.length || cambio.isPending} onClick={() => cambio.mutate(false)}>
              {cambio.isPending ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="flex justify-end">
        <Button
          ref={boton}
          size="icon"
          variant="ghost"
          aria-label={`Opciones de ${voto.cursoCodigo}`}
          aria-haspopup="menu"
          aria-expanded={!!menu}
          disabled={cambio.isPending}
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
              aria-label={`Acciones de ${voto.cursoCodigo}`}
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
                  const items = Array.from(opciones.current!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
                  const i = items.indexOf(document.activeElement as HTMLButtonElement);
                  items[(i + (ev.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
                }
              }}
            >
              <button
                role="menuitem"
                className="w-full rounded px-3 py-2 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none"
                onClick={() => {
                  setMenu(null);
                  setFranjas(voto.franjas);
                  setEditando(true);
                }}
              >
                Editar franjas
              </button>
              <button
                role="menuitem"
                className="w-full rounded px-3 py-2 text-left text-sm text-destructive hover:bg-accent focus:bg-accent focus:outline-none"
                onClick={() => {
                  setMenu(null);
                  boton.current?.focus();
                  if (
                    window.confirm(
                      `¿Retirar tu elección de ${voto.cursoNombre}? También se retirarán los electivos que dependan de este para llevarlos en simultáneo.`,
                    )
                  )
                    cambio.mutate(true);
                }}
              >
                Retirar
              </button>
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
}

export default function MisVotos() {
  const { procesoId, rutaProceso } = useVotacionAlumno();
  const votos = useQuery({ queryKey: ['alumno', procesoId, 'votos'], queryFn: () => api.misVotos(procesoId) });
  const estado = useEstadoAlumno();

  if (votos.isLoading) return <Cargando />;
  if (votos.error) return <ErrorCarga error={votos.error} />;

  return (
    <div>
      <Titulo
        titulo="Mis votos"
        descripcion={
          estado.data
            ? `Votos usados: ${estado.data.votosUsados} de ${estado.data.maxCursos}. Puedes modificar o retirar tus votos mientras la votación esté abierta.`
            : undefined
        }
      />
      {votos.data!.length === 0 ? (
        <Vacio>
          Aún no has votado.{' '}
          <Link to={`${rutaProceso}/cursos`} className="font-medium text-primary underline">
            Ir a los cursos
          </Link>
        </Vacio>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Curso</TableHead>
                <TableHead>Créditos</TableHead>
                <TableHead>Franjas</TableHead>
                <TableHead>Aptitud al votar</TableHead>
                <TableHead>Fecha</TableHead>
                {estado.data?.abierto && (
                  <TableHead className="w-14">
                    <span className="sr-only">Opciones del voto</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {votos.data!.map((v) => (
                <TableRow key={v.id}>
                  <TableCell>
                    <span className="font-mono text-xs font-semibold">{v.cursoCodigo}</span>
                    <div>{v.cursoNombre}</div>
                  </TableCell>
                  <TableCell className="tabular-nums">{formatearCreditos(v.creditos)}</TableCell>
                  <TableCell>
                    <FranjasTexto franjas={v.franjas} />
                  </TableCell>
                  <TableCell>
                    <AptitudSnapshot aptitud={v.aptitud} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {formatearFecha(v.createdAt)}
                  </TableCell>
                  {estado.data?.abierto && (
                    <TableCell>
                      <EditarVoto voto={v} maxFranjas={estado.data.maxFranjas} />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
