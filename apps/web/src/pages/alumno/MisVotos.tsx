import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
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
      {editando && (
        <div className="flex flex-wrap gap-2">
          {FRANJAS.map((f) => (
            <label key={f.valor} className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={franjas.includes(f.valor)}
                disabled={cambio.isPending || (!franjas.includes(f.valor) && franjas.length >= maxFranjas)}
                onChange={() =>
                  setFranjas((a) => (a.includes(f.valor) ? a.filter((x) => x !== f.valor) : [...a, f.valor]))
                }
              />
              {f.etiqueta}
            </label>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        {editando ? (
          <>
            <Button size="sm" disabled={!franjas.length || cambio.isPending} onClick={() => cambio.mutate(false)}>
              Guardar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setFranjas(voto.franjas);
              setEditando(true);
            }}
          >
            Editar franjas
          </Button>
        )}
        <Button
          size="sm"
          variant="destructive"
          disabled={cambio.isPending}
          onClick={() => {
            if (
              window.confirm(
                `¿Retirar tu elección de ${voto.cursoNombre}? También se retirarán los electivos que dependan de este para llevarlos en simultáneo.`,
              )
            )
              cambio.mutate(true);
          }}
        >
          Retirar
        </Button>
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
                {estado.data?.abierto && <TableHead>Acciones</TableHead>}
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
