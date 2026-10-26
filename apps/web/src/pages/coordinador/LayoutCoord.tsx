import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useState } from 'react';
import { Layout } from '@/components/Layout';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { ETIQUETA_ESTADO } from '@/lib/formato';

const ENLACES = [
  { a: '/coord', texto: 'Panel', fin: true },
  { a: '/coord/resultados', texto: 'Resultados' },
  { a: '/coord/seguimiento', texto: 'Consejo' },
  { a: '/coord/procesos', texto: 'Procesos' },
  { a: '/coord/carga', texto: 'Carga de datos' },
  { a: '/coord/cursos', texto: 'Catálogo' },
  { a: '/coord/padron', texto: 'Padrón' },
];

/** Proceso con el que trabaja el coordinador (undefined = el activo: abierto o el último). */
const ProcesoContext = createContext<{ procesoId?: string; setProcesoId: (id?: string) => void }>({
  setProcesoId: () => {},
});
export const useProcesoSeleccionado = () => useContext(ProcesoContext);

export function SelectorProceso() {
  const { procesoId, setProcesoId } = useProcesoSeleccionado();
  const procesos = useQuery({ queryKey: ['coord', 'procesos'], queryFn: api.procesos });
  if (!procesos.data || procesos.data.length < 2) return null;
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="selector-proceso" className="whitespace-nowrap text-muted-foreground">
        Proceso
      </Label>
      <Select
        id="selector-proceso"
        className="h-9 w-64"
        value={procesoId ?? ''}
        onChange={(e) => setProcesoId(e.target.value || undefined)}
      >
        <option value="">Activo (abierto o el último)</option>
        {procesos.data.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nombre} — {ETIQUETA_ESTADO[p.estado]}
          </option>
        ))}
      </Select>
    </div>
  );
}

export default function LayoutCoord() {
  const [procesoId, setProcesoId] = useState<string | undefined>();
  return (
    <ProcesoContext.Provider value={{ procesoId, setProcesoId }}>
      <Layout enlaces={ENLACES} rolTexto="Coordinación" />
    </ProcesoContext.Provider>
  );
}
