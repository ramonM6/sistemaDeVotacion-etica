import { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, useMatch } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { EstadoProcesoBadge } from '@/components/Insignias';
import { api } from '@/lib/api';
import type { Proceso } from '@/lib/tipos';
import { cn } from '@/lib/utils';
import AdministrarVotacion from './AdministrarVotacion';

const ProcesoContext = createContext<{
  procesoId?: string;
  rutaProceso: string;
  proceso?: Proceso;
  enPreparacion: boolean;
  cargandoProceso: boolean;
}>({ rutaProceso: '/coord', enPreparacion: false, cargandoProceso: false });
export const useProcesoSeleccionado = () => useContext(ProcesoContext);
const ENLACES = [
  { a: '/coord', texto: 'Votaciones', fin: true },
  { a: '/coord/plantillas', texto: 'Plantillas' },
];

export default function LayoutCoord() {
  const coincidencia = useMatch('/coord/votaciones/:procesoId/*');
  const enCreacion = !!useMatch('/coord/nueva-votacion');
  const procesoId = coincidencia?.params.procesoId;
  const rutaProceso = procesoId ? `/coord/votaciones/${procesoId}` : '/coord';
  const consulta = useQuery({
    queryKey: ['coord', 'procesos'],
    queryFn: api.procesos,
    enabled: !!procesoId,
    refetchInterval: procesoId ? 30_000 : false,
  });
  const proceso = consulta.data?.find((p) => p.id === procesoId);
  const enPreparacion = proceso?.estado === 'BORRADOR' && !proceso.primeraApertura;
  return (
    <ProcesoContext.Provider
      value={{ procesoId, rutaProceso, proceso, enPreparacion, cargandoProceso: consulta.isLoading }}
    >
      <Layout
        enlaces={ENLACES.map((e) => ({ ...e, activo: e.a === '/coord' && (!!procesoId || enCreacion) }))}
        rolTexto="Coordinación"
      >
        {procesoId && (
          <section className="mb-7 space-y-4">
            <Button asChild variant="ghost" size="sm" className="-ml-3">
              <Link to="/coord">
                <ArrowLeft /> Todas las votaciones
              </Link>
            </Button>
            {proceso && (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-lg font-semibold">{proceso.nombre}</p>
                <EstadoProcesoBadge estado={proceso.estado} />
              </div>
            )}
            {proceso && <AdministrarVotacion key={proceso.id} proceso={proceso} />}
            <nav aria-label="Navegación de la votación" className="flex flex-wrap gap-x-5 gap-y-1 border-b">
              {[
                { a: `${rutaProceso}/cursos`, texto: 'Cursos' },
                { a: `${rutaProceso}/resultados`, texto: 'Resultados' },
                { a: `${rutaProceso}/carga`, texto: 'Datos y archivos' },
                { a: `${rutaProceso}/padron`, texto: 'Padrón' },
              ].map((e) => (
                <NavLink
                  key={e.a}
                  to={e.a}
                  className={({ isActive }) =>
                    cn(
                      'border-b-2 border-transparent px-1 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
                      isActive && 'border-primary text-primary',
                    )
                  }
                >
                  {e.texto}
                </NavLink>
              ))}
            </nav>
          </section>
        )}
      </Layout>
    </ProcesoContext.Provider>
  );
}
