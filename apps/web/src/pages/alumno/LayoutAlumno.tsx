import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Layout } from '@/components/Layout';
import { Cargando, ErrorCarga } from '@/components/Estados';
import { EstadoProcesoBadge } from '@/components/Insignias';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useResultadosEnVivo } from '@/lib/socket';

export function useVotacionAlumno() {
  const { procesoId } = useParams();
  return { procesoId, rutaProceso: `/alumno/votaciones/${procesoId}` };
}
export function useEstadoAlumno() {
  const { procesoId } = useVotacionAlumno();
  return useQuery({
    queryKey: ['alumno', procesoId, 'estado'],
    queryFn: () => api.estadoAlumno(procesoId),
    enabled: !!procesoId,
    refetchInterval: 30_000,
  });
}
export default function LayoutAlumno() {
  const { procesoId, rutaProceso } = useVotacionAlumno();
  const estado = useEstadoAlumno();
  useResultadosEnVivo([['alumno']]);
  // Impide mostrar datos de otra votación o consultar páginas sin autorización.
  if (procesoId && estado.isLoading)
    return (
      <Layout mostrarPagina={false} enlaces={[{ a: '/alumno', texto: 'Votaciones' }]} rolTexto="Alumno">
        <Cargando />
      </Layout>
    );
  if (procesoId && estado.error) return <LayoutError error={estado.error} />;
  return (
    <Layout enlaces={[{ a: '/alumno', texto: 'Votaciones', fin: true, activo: !!procesoId }]} rolTexto="Alumno">
      {procesoId && estado.data && (
        <section className="mb-7 space-y-4">
          <Link to="/alumno" className="inline-flex items-center gap-2 text-sm">
            <ArrowLeft className="h-4 w-4" /> Todas las votaciones
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-lg font-semibold">{estado.data.proceso.nombre}</h1>
            <EstadoProcesoBadge estado={estado.data.proceso.estado} />
          </div>
          <p className="text-sm text-muted-foreground">
            {estado.data.votosUsados} de {estado.data.maxCursos} votos usados ·{' '}
            {estado.data.abierto ? 'Puedes votar y modificar tus elecciones.' : 'Votación en modo de solo lectura.'}
          </p>
          <nav aria-label="Navegación de la votación" className="flex flex-wrap gap-x-5 gap-y-1 border-b">
            {[
              ['cursos', 'Cursos'],
              ['votos', 'Mis votos'],
              ['resultados', 'Resultados'],
              ['seguimiento', 'Seguimiento'],
            ].map(([ruta, texto]) => (
              <NavLink
                key={ruta}
                to={`${rutaProceso}/${ruta}`}
                className={({ isActive }) =>
                  cn(
                    'border-b-2 border-transparent px-1 py-3 text-sm font-medium text-muted-foreground',
                    isActive && 'border-primary text-primary',
                  )
                }
              >
                {texto}
              </NavLink>
            ))}
          </nav>
        </section>
      )}
    </Layout>
  );
}
function LayoutError({ error }: { error: Error }) {
  return (
    <Layout mostrarPagina={false} enlaces={[{ a: '/alumno', texto: 'Votaciones' }]} rolTexto="Alumno">
      <Link to="/alumno" className="text-primary underline">
        Todas las votaciones
      </Link>
      <ErrorCarga error={error} />
    </Layout>
  );
}
