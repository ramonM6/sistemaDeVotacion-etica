import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Cargando, ErrorCarga } from '@/components/Estados';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import type { SeguimientoCurso } from '@/lib/api';
import type { Proceso } from '@/lib/tipos';
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
function Fila({
  curso,
  procesoId,
  cerrado,
  votos,
}: {
  curso: SeguimientoCurso;
  procesoId: string;
  cerrado: boolean;
  votos: number;
}) {
  const cliente = useQueryClient();
  const [estado, setEstado] = useState('');
  const [observacion, setObservacion] = useState(curso.observacion);
  const cambio = () => {
    const datos = { ...curso, observacion };
    if (['SELECCIONADO_PARA_REVISION', 'NO_SELECCIONADO'].includes(estado))
      Object.assign(datos, { seleccion: estado, consejo: 'PENDIENTE', dictado: 'PENDIENTE' });
    else if (['APROBADO', 'NO_APROBADO'].includes(estado))
      Object.assign(datos, { consejo: estado, dictado: 'PENDIENTE' });
    else if (estado) datos.dictado = estado;
    return api.guardarSeguimiento(procesoId, curso.codigo, datos);
  };
  const guardar = useMutation({
    mutationFn: cambio,
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['coord'] });
      setEstado('');
      toast.success('Estado del curso actualizado');
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const opciones = [
    'SELECCIONADO_PARA_REVISION',
    'NO_SELECCIONADO',
    ...(curso.seleccion === 'SELECCIONADO_PARA_REVISION' ? ['APROBADO', 'NO_APROBADO'] : []),
    ...(curso.consejo === 'APROBADO' ? ['CONFIRMADO', 'NO_SE_DICTARA'] : []),
  ];
  const actual =
    curso.dictado !== 'PENDIENTE' ? curso.dictado : curso.consejo !== 'PENDIENTE' ? curso.consejo : curso.seleccion;
  return (
    <tr className="border-t align-top">
      <td className="px-4 py-4">
        <span className="font-mono text-xs font-semibold">{curso.codigo}</span>
        <p className="mt-1 text-sm">{curso.nombre}</p>
      </td>
      <td className="px-4 py-4 text-center font-semibold">{votos}</td>
      <td className="px-4 py-4">
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
          {actual === 'PENDIENTE' ? 'Pendiente de selección' : etiquetas[actual]}
        </span>
        <p className="mt-2 text-xs text-muted-foreground">
          Selección: {etiquetas[curso.seleccion]}
          <br />
          Consejo: {etiquetas[curso.consejo]}
        </p>
      </td>
      <td className="min-w-[270px] px-4 py-4">
        {cerrado ? (
          <div className="space-y-2">
            <Select
              aria-label={`Nuevo estado para ${curso.codigo}`}
              value={estado}
              disabled={guardar.isPending}
              onChange={(e) => setEstado(e.target.value)}
            >
              <option value="">Cambiar estado…</option>
              {opciones.map((o) => (
                <option value={o} key={o}>
                  {etiquetas[o]}
                </option>
              ))}
            </Select>
            <Input
              aria-label={`Observación de ${curso.codigo}`}
              placeholder="Observación (opcional)"
              value={observacion}
              maxLength={2000}
              disabled={guardar.isPending}
              onChange={(e) => setObservacion(e.target.value)}
            />
            <Button
              size="sm"
              disabled={guardar.isPending || (!estado && observacion === curso.observacion)}
              onClick={() => {
                if (
                  !estado ||
                  window.confirm(
                    '¿Actualizar el estado? Cambiar la selección o la decisión del consejo limpiará los estados posteriores.',
                  )
                )
                  guardar.mutate();
              }}
            >
              Guardar
            </Button>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground">Disponible al cerrar la votación</span>
        )}
      </td>
    </tr>
  );
}
export default function EstadosCursos({
  ranking,
  proceso,
}: {
  ranking: { codigo: string; total: number }[];
  proceso: Proceso;
}) {
  const { procesoId } = useProcesoSeleccionado();
  const cliente = useQueryClient();
  const consulta = useQuery({
    queryKey: ['coord', 'seguimiento', procesoId],
    queryFn: () => api.seguimiento(procesoId),
  });
  const [csv, setCsv] = useState('');
  const [vista, setVista] = useState<{ procesoId: string; filas: unknown[]; csv: string } | null>(null);
  const carga = useMutation({
    mutationFn: (confirmar: boolean) =>
      confirmar && vista
        ? api.confirmarConsejo(vista.procesoId, vista.csv)
        : api.previewConsejo(consulta.data!.proceso.id, csv),
    onSuccess: (r, confirmar) => {
      if (confirmar) {
        setVista(null);
        setCsv('');
        cliente.invalidateQueries({ queryKey: ['coord'] });
        toast.success('Decisiones importadas');
      } else setVista({ ...(r as { procesoId: string; filas: unknown[] }), csv });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (consulta.isLoading) return <Cargando />;
  if (consulta.error) return <ErrorCarga error={consulta.error} />;
  const { cursos } = consulta.data!;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Cursos de la votación</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {proceso.estado === 'CERRADO'
            ? 'Decide qué cursos pasan a revisión, registra la decisión del consejo y confirma cuáles se dictarán.'
            : 'Revisa la oferta. Podrás cambiar los estados de los cursos cuando la votación esté cerrada.'}
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-left">
          <thead className="bg-muted/50 text-sm text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Electivo</th>
              <th className="px-4 py-3">Votos</th>
              <th className="px-4 py-3">Estado actual</th>
              <th className="px-4 py-3">Decisión del coordinador</th>
            </tr>
          </thead>
          <tbody>
            {cursos
              .slice()
              .sort(
                (a, b) =>
                  (ranking.find((r) => r.codigo === b.codigo)?.total ?? 0) -
                    (ranking.find((r) => r.codigo === a.codigo)?.total ?? 0) || a.codigo.localeCompare(b.codigo),
              )
              .map((c) => (
                <Fila
                  key={`${proceso.id}-${c.codigo}-${c.updatedAt ?? ''}`}
                  curso={c}
                  procesoId={proceso.id}
                  cerrado={proceso.estado === 'CERRADO'}
                  votos={ranking.find((r) => r.codigo === c.codigo)?.total ?? 0}
                />
              ))}
          </tbody>
        </table>
        {!cursos.length && (
          <p className="p-6 text-sm text-muted-foreground">No hay electivos cargados en esta votación.</p>
        )}
      </div>
      {proceso.estado === 'CERRADO' && (
        <details className="rounded-lg border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">Importar decisiones del consejo por CSV</summary>
          <Card className="space-y-3 p-4">
            <p className="text-sm">
              CSV del consejo: codigo,consejo,dictado,observacion. Selecciona primero los cursos para revisión.
            </p>
            <input
              aria-label="Archivo CSV de decisiones"
              type="file"
              accept=".csv,text/csv"
              disabled={proceso.estado !== 'CERRADO' || carga.isPending}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                setVista(null);
                setCsv('');
                if (f) {
                  if (f.size > 2000000) {
                    toast.error('Máximo 2 MB');
                    return;
                  }
                  setCsv(await f.text());
                }
              }}
            />
            <Button
              disabled={!csv || carga.isPending || proceso.estado !== 'CERRADO'}
              onClick={() => carga.mutate(false)}
            >
              Validar y previsualizar
            </Button>
            {vista && vista.procesoId === proceso.id && (
              <div>
                <pre className="max-h-64 overflow-auto text-xs">{JSON.stringify(vista.filas, null, 2)}</pre>
                <Button disabled={carga.isPending} onClick={() => carga.mutate(true)}>
                  Confirmar {vista.filas.length} decisiones
                </Button>
              </div>
            )}
          </Card>
        </details>
      )}
    </div>
  );
}
