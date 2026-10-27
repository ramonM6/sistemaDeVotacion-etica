import { useQuery } from '@tanstack/react-query';
import { Cargando, ErrorCarga, Titulo, Vacio } from '@/components/Estados';
import { EstadoCursoBadge } from '@/components/EstadoCursoBadge';
import { Card } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useVotacionAlumno } from './LayoutAlumno';
export default function Seguimiento() {
  const { procesoId } = useVotacionAlumno();
  const consulta = useQuery({
    queryKey: ['alumno', procesoId, 'seguimiento'],
    queryFn: () => api.seguimientoAlumno(procesoId!),
    refetchInterval: 30_000,
  });
  if (consulta.isLoading) return <Cargando />;
  if (consulta.error) return <ErrorCarga error={consulta.error} />;
  const { proceso, cursos } = consulta.data!;
  return (
    <div>
      <Titulo
        titulo="Seguimiento de cursos"
        descripcion="Consulta las decisiones que registra la coordinación en cada etapa."
      />
      {proceso.estado !== 'CERRADO' ? (
        <Vacio>El seguimiento estará disponible al cierre de la votación.</Vacio>
      ) : !cursos.length ? (
        <Vacio>No hay cursos en esta votación.</Vacio>
      ) : (
        <div className="space-y-4">
          {cursos.map((c) => (
            <Card key={c.codigo} className="p-5">
              <h2 className="mb-4 font-semibold">
                <span className="font-mono">{c.codigo}</span> · {c.nombre}
              </h2>
              <ol className="grid gap-4 sm:grid-cols-3">
                <li>
                  <p className="mb-2 text-sm text-muted-foreground">1. Selección de cursos</p>
                  <EstadoCursoBadge estado={c.seleccion} />
                </li>
                <li>
                  <p className="mb-2 text-sm text-muted-foreground">2. Resultados del consejo</p>
                  {c.seleccion === 'NO_SELECCIONADO' ? (
                    <span className="text-sm text-muted-foreground">No pasa a esta etapa</span>
                  ) : (
                    <EstadoCursoBadge
                      estado={c.consejo}
                      texto={c.seleccion === 'PENDIENTE' ? 'En espera de selección' : undefined}
                    />
                  )}
                </li>
                <li>
                  <p className="mb-2 text-sm text-muted-foreground">3. Decisión de dictado</p>
                  {c.seleccion === 'NO_SELECCIONADO' || c.consejo === 'NO_APROBADO' ? (
                    <span className="text-sm text-muted-foreground">No pasa a esta etapa</span>
                  ) : (
                    <EstadoCursoBadge
                      estado={c.dictado}
                      texto={
                        c.consejo !== 'APROBADO'
                          ? 'En espera del consejo'
                          : c.dictado === 'PENDIENTE'
                            ? 'Pendiente de profesor'
                            : undefined
                      }
                    />
                  )}
                </li>
              </ol>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
