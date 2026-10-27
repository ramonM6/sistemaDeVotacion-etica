import { createContext, useContext } from 'react';
import { Link, useMatch } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';

const ProcesoContext = createContext<{ procesoId?: string; rutaProceso: string }>({ rutaProceso: '/coord' });
export const useProcesoSeleccionado = () => useContext(ProcesoContext);

export default function LayoutCoord() {
  const coincidencia = useMatch('/coord/votaciones/:procesoId/*');
  const procesoId = coincidencia?.params.procesoId;
  const rutaProceso = procesoId ? `/coord/votaciones/${procesoId}` : '/coord';
  const enlaces = procesoId
    ? [
        { a: '/coord', texto: 'Votaciones', fin: true },
        { a: rutaProceso, texto: 'Resumen y cursos', fin: true },
        { a: `${rutaProceso}/resultados`, texto: 'Resultados' },
        { a: `${rutaProceso}/carga`, texto: 'Carga de datos' },
        { a: `${rutaProceso}/padron`, texto: 'Padrón' },
        { a: '/coord/catalogo', texto: 'Catálogo base' },
      ]
    : [
        { a: '/coord', texto: 'Votaciones', fin: true },
        { a: '/coord/catalogo', texto: 'Catálogo base' },
      ];
  return (
    <ProcesoContext.Provider value={{ procesoId, rutaProceso }}>
      <Layout enlaces={enlaces} rolTexto="Coordinación">
        {procesoId && (
          <Button asChild variant="ghost" size="sm" className="mb-5 -ml-3">
            <Link to="/coord">
              <ArrowLeft /> Todas las votaciones
            </Link>
          </Button>
        )}
      </Layout>
    </ProcesoContext.Provider>
  );
}
