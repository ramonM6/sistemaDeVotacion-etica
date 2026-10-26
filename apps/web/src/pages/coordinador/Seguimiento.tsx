import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Cargando, ErrorCarga, Titulo } from '@/components/Estados';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import type { SeguimientoCurso } from '@/lib/api';
import { SelectorProceso, useProcesoSeleccionado } from './LayoutCoord';

const etiquetas: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  SELECCIONADO_PARA_REVISION: 'Seleccionado para revisión',
  NO_SELECCIONADO: 'No seleccionado',
  APROBADO: 'Aprobado',
  NO_APROBADO: 'No aprobado',
  CONFIRMADO: 'Confirmado',
  NO_SE_DICTARA: 'No se dictará',
};
function Fila({ curso, procesoId, cerrado }: { curso: SeguimientoCurso; procesoId: string; cerrado: boolean }) {
  const cliente = useQueryClient();
  const [datos, setDatos] = useState(curso);
  const guardar = useMutation({
    mutationFn: () => api.guardarSeguimiento(procesoId, curso.codigo, datos),
    onSuccess: () => {
      cliente.invalidateQueries({ queryKey: ['coord', 'seguimiento'] });
      toast.success('Decisión guardada');
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const selector = (campo: 'seleccion' | 'consejo' | 'dictado', opciones: string[]) => (
    <Select
      aria-label={`${campo} de ${curso.codigo}`}
      value={datos[campo]}
      disabled={!cerrado || guardar.isPending}
      onChange={(e) => setDatos((d) => ({ ...d, [campo]: e.target.value }))}
    >
      {opciones.map((o) => (
        <option key={o} value={o}>
          {etiquetas[o]}
        </option>
      ))}
    </Select>
  );
  return (
    <Card className="space-y-3 p-4">
      <p className="font-semibold">
        {curso.codigo} · {curso.nombre}
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm">
          Selección{selector('seleccion', ['PENDIENTE', 'SELECCIONADO_PARA_REVISION', 'NO_SELECCIONADO'])}
        </label>
        <label className="text-sm">Consejo{selector('consejo', ['PENDIENTE', 'APROBADO', 'NO_APROBADO'])}</label>
        <label className="text-sm">Dictado{selector('dictado', ['PENDIENTE', 'CONFIRMADO', 'NO_SE_DICTARA'])}</label>
      </div>
      <Input
        aria-label={`Observación de ${curso.codigo}`}
        placeholder="Observación"
        maxLength={2000}
        disabled={!cerrado}
        value={datos.observacion}
        onChange={(e) => setDatos((d) => ({ ...d, observacion: e.target.value }))}
      />
      <Button disabled={!cerrado || guardar.isPending} onClick={() => guardar.mutate()}>
        Guardar decisión
      </Button>
    </Card>
  );
}
export default function Seguimiento() {
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
  const { proceso, cursos } = consulta.data!;
  return (
    <div className="space-y-4">
      <Titulo
        titulo="Seguimiento del consejo"
        descripcion="Selección manual, evaluación del consejo y decisión de dictado. Disponible después del cierre."
        acciones={<SelectorProceso />}
      />
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
        <Button disabled={!csv || carga.isPending || proceso.estado !== 'CERRADO'} onClick={() => carga.mutate(false)}>
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
      {cursos.map((c) => (
        <Fila
          key={`${proceso.id}-${c.codigo}-${c.updatedAt ?? ''}`}
          curso={c}
          procesoId={proceso.id}
          cerrado={proceso.estado === 'CERRADO'}
        />
      ))}
    </div>
  );
}
