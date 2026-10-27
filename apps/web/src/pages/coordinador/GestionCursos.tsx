import { useQuery } from '@tanstack/react-query';
import { Navigate, useParams } from 'react-router-dom';
import { Cargando, ErrorCarga, Titulo } from '@/components/Estados';
import { api } from '@/lib/api';
import { useProcesoSeleccionado } from './LayoutCoord';
import EstadosCursos, { ETAPAS, type Etapa } from './EstadosCursos';

export default function GestionCursos() {
  const { etapa = 'seleccion' } = useParams();
  const { procesoId, rutaProceso } = useProcesoSeleccionado();
  const consulta = useQuery({
    queryKey: ['coord', 'resultados', procesoId, null],
    queryFn: () => api.resultadosCoord(procesoId),
  });
  if (!ETAPAS.includes(etapa as Etapa)) return <Navigate to={`${rutaProceso}/cursos/seleccion`} replace />;
  if (consulta.isLoading) return <Cargando />;
  if (consulta.error) return <ErrorCarga error={consulta.error} />;
  return (
    <div className="space-y-6">
      <Titulo
        titulo="Cursos de la votación"
        descripcion="Gestiona la selección, revisión y dictado por etapas. Puedes marcar varios cursos y aplicarles una misma decisión."
      />
      <EstadosCursos ranking={consulta.data!.ranking} proceso={consulta.data!.proceso} etapa={etapa as Etapa} />
    </div>
  );
}
