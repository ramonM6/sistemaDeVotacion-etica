import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cargando, ErrorCarga, Titulo, Vacio } from '@/components/Estados';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatearCreditos } from '@/lib/formato';
import { useResultadosEnVivo } from '@/lib/socket';
import { useProcesoSeleccionado } from './LayoutCoord';

export default function Padron() {
  const { procesoId, rutaProceso } = useProcesoSeleccionado();
  const padron = useQuery({ queryKey: ['coord', 'padron', procesoId], queryFn: () => api.padron(procesoId) });
  useResultadosEnVivo([['coord', 'padron']]);
  const [busqueda, setBusqueda] = useState('');

  const alumnos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (padron.data?.alumnos ?? []).filter(
      (a) => !q || a.codigo.includes(q) || `${a.nombres} ${a.apellidos}`.toLowerCase().includes(q),
    );
  }, [padron.data, busqueda]);

  if (padron.isLoading) return <Cargando />;
  if (padron.error) return <ErrorCarga error={padron.error} />;
  const { proceso } = padron.data!;

  return (
    <div>
      <Titulo
        titulo="Padrón"
        descripcion={`${padron.data!.alumnos.length} alumnos habilitados en ${proceso.nombre}.`}
      />
      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          className="pl-9"
          placeholder="Buscar por código o nombre"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>
      {padron.data!.alumnos.length === 0 ? (
        <Vacio>No hay alumnos habilitados. Carga el historial académico de esta votación.</Vacio>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Alumno</TableHead>
                <TableHead className="text-right">Créditos aprobados</TableHead>
                <TableHead className="text-right">Créditos en curso</TableHead>
                <TableHead className="text-right">Votos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alumnos.map((a) => (
                <TableRow key={a.codigo}>
                  <TableCell className="font-mono text-xs">
                    <Link
                      to={`${rutaProceso}/padron/${a.codigo}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {a.codigo}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link to={`${rutaProceso}/padron/${a.codigo}`} className="hover:underline">
                      {a.apellidos}, {a.nombres}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatearCreditos(a.creditosAprobados)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatearCreditos(a.creditosEnCurso)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {a.votos} / {proceso.maxCursos}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
