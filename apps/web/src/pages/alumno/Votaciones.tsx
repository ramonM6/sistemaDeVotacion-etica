import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Cargando, ErrorCarga, Titulo, Vacio } from '@/components/Estados';
import { EstadoProcesoBadge } from '@/components/Insignias';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { api } from '@/lib/api';
import { formatearFecha } from '@/lib/formato';
export default function Votaciones() {
  const consulta = useQuery({ queryKey: ['alumno', 'procesos'], queryFn: api.procesosAlumno, refetchInterval: 30_000 });
  if (consulta.isLoading) return <Cargando />;
  if (consulta.error) return <ErrorCarga error={consulta.error} />;
  return (
    <div>
      <Titulo
        titulo="Votaciones"
        descripcion="Elige una votación para consultar sus cursos, tus votos y su seguimiento."
      />
      {!consulta.data?.length ? (
        <Vacio>No tienes votaciones disponibles en tu padrón.</Vacio>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {consulta.data.map((p) => (
            <Link key={p.id} to={`/alumno/votaciones/${p.id}`} className="group">
              <Card className="h-full transition-shadow group-hover:shadow-md">
                <CardHeader>
                  <div>
                    <EstadoProcesoBadge estado={p.estado} />
                  </div>
                  <CardTitle className="text-lg">{p.nombre}</CardTitle>
                  <CardDescription>Ciclo {p.cicloObjetivo}</CardDescription>
                  <CardDescription>
                    Del {formatearFecha(p.fechaInicio)} al {formatearFecha(p.fechaFin)}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
