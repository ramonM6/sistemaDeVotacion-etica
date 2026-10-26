import { useQuery } from '@tanstack/react-query';
import { Layout } from '@/components/Layout';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { api, ApiError } from '@/lib/api';
import { TerminosModal } from './TerminosModal';

const ENLACES = [
  { a: '/alumno', texto: 'Inicio', fin: true },
  { a: '/alumno/catalogo', texto: 'Catálogo' },
  { a: '/alumno/votos', texto: 'Mis votos' },
  { a: '/alumno/resultados', texto: 'Resultados' },
];

export const useEstadoAlumno = () =>
  useQuery({ queryKey: ['alumno', 'estado'], queryFn: api.estadoAlumno, refetchInterval: 30_000 });

export default function LayoutAlumno() {
  const estado = useEstadoAlumno();
  const noHabilitado = estado.error instanceof ApiError && (estado.error.status === 403 || estado.error.status === 404);

  return (
    <Layout enlaces={ENLACES} rolTexto="Alumno">
      {noHabilitado && (
        <Alert variant="warning" className="mb-6">
          <AlertTitle>No hay un proceso de votación disponible para ti</AlertTitle>
          <AlertDescription>{(estado.error as Error).message}</AlertDescription>
        </Alert>
      )}
      {estado.data && <TerminosModal estado={estado.data} />}
    </Layout>
  );
}
