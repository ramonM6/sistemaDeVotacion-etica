import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Cargando, ErrorCarga, Titulo, Vacio } from '@/components/Estados';
import { EstadoProcesoBadge } from '@/components/Insignias';
import { ArrowRight, CalendarDays, Vote } from 'lucide-react';
import { api } from '@/lib/api';
import { formatearFecha } from '@/lib/formato';
export default function Votaciones() {
  const consulta = useQuery({ queryKey: ['alumno', 'procesos'], queryFn: api.procesosAlumno, refetchInterval: 30_000 });
  if (consulta.isLoading) return <Cargando />;
  if (consulta.error) return <ErrorCarga error={consulta.error} />;
  return (
    <div className="space-y-6">
      <Titulo
        titulo="Votaciones"
        descripcion="Elige una votación para consultar sus cursos, tus votos y su seguimiento."
      />
      {!consulta.data?.length ? (
        <Vacio>No tienes votaciones disponibles.</Vacio>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {consulta.data.map((p) => (
            <Link
              key={p.id}
              to={`/alumno/votaciones/${p.id}`}
              className="group overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div
                className={`relative flex h-32 items-end justify-between overflow-hidden p-5 ${p.estado === 'ABIERTO' ? 'bg-blue-700' : p.estado === 'CERRADO' ? 'bg-slate-700' : 'bg-teal-700'}`}
              >
                <div
                  aria-hidden="true"
                  className="absolute -right-5 -top-9 h-40 w-40 rounded-full border-[22px] border-white/10"
                />
                <div className="relative">
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/75">Votación de electivos</p>
                  <p className="mt-1 text-3xl font-bold text-white">{p.cicloObjetivo}</p>
                </div>
                <Vote aria-hidden="true" className="relative h-9 w-9 text-white/80" />
              </div>
              <div className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold leading-snug group-hover:text-primary">{p.nombre}</h2>
                  <EstadoProcesoBadge estado={p.estado} />
                </div>
                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CalendarDays aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {formatearFecha(p.fechaInicio)}
                    <br />
                    hasta {formatearFecha(p.fechaFin)}
                  </span>
                </p>
                <div className="flex items-center justify-between border-t pt-4 text-sm font-semibold text-primary">
                  <span>Entrar a la votación</span>
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
